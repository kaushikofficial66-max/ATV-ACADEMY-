import { Op } from 'sequelize';
import {
  sequelize,
  Quiz,
  QuizQuestion,
  QuizAnswer,
  QuizAttempt,
  QuizAttemptAnswer,
  Course,
  CourseSection,
  Lecture
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { toMoney } from '../../utils/helpers.js';
import { assertEnrolled } from '../../services/accessService.js';
import { notifyUser } from '../../services/notificationService.js';

const LATE_GRACE_MS = 2 * 60 * 1000;

const attemptDeadline = (quiz, attempt) =>
  quiz.time_limit_minutes ? new Date(new Date(attempt.started_at).getTime() + quiz.time_limit_minutes * 60 * 1000) : null;

const loadPublishedQuiz = async (quizId) => {
  const quiz = await Quiz.findByPk(quizId);
  if (!quiz || quiz.status !== 'published') throw ApiError.notFound('Quiz not found.');
  return quiz;
};

const attemptStats = async (quiz, userId) => {
  const attempts = await QuizAttempt.findAll({
    where: { quiz_id: quiz.id, user_id: userId },
    attributes: ['id', 'attempt_number', 'status', 'score', 'percentage', 'passed', 'started_at', 'submitted_at'],
    order: [['attempt_number', 'DESC']]
  });
  const finished = attempts.filter((a) => a.status !== 'started');
  const inProgress = attempts.find((a) => a.status === 'started');
  const used = attempts.length;
  return {
    attempts,
    attempts_used: used,
    attempts_remaining: quiz.max_attempts ? Math.max(0, quiz.max_attempts - used) : null,
    best_percentage: finished.length ? Math.max(...finished.map((a) => Number(a.percentage))) : null,
    has_passed: finished.some((a) => a.passed),
    in_progress_attempt_id: inProgress ? inProgress.id : null,
    can_attempt: Boolean(inProgress) || !quiz.max_attempts || used < quiz.max_attempts
  };
};

/** GET /student/courses/:courseId/quizzes */
export const listCourseQuizzes = async (req, res) => {
  await assertEnrolled(req.user.id, req.params.courseId);
  const quizzes = await Quiz.findAll({
    where: { course_id: req.params.courseId, status: 'published' },
    attributes: ['id', 'title', 'description', 'section_id', 'lecture_id', 'passing_marks', 'total_marks', 'time_limit_minutes', 'max_attempts'],
    include: [
      { model: CourseSection, as: 'section', attributes: ['id', 'title'] },
      { model: Lecture, as: 'lecture', attributes: ['id', 'title'] }
    ],
    order: [['created_at', 'ASC']]
  });
  const result = [];
  for (const quiz of quizzes) {
    const stats = await attemptStats(quiz, req.user.id);
    delete stats.attempts;
    result.push({ ...quiz.toJSON(), ...stats });
  }
  return successResponse(res, { data: { quizzes: result } });
};

/** GET /student/quizzes/:quizId - quiz overview (no questions) and the student's attempt status. */
export const getQuiz = async (req, res) => {
  const quiz = await loadPublishedQuiz(req.params.quizId);
  await assertEnrolled(req.user.id, quiz.course_id);
  const questionCount = await QuizQuestion.count({ where: { quiz_id: quiz.id } });
  const course = await Course.findByPk(quiz.course_id, { attributes: ['id', 'title', 'slug'] });
  return successResponse(res, {
    data: {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passing_marks: quiz.passing_marks,
        total_marks: quiz.total_marks,
        passing_percentage: Number(quiz.total_marks) ? Math.round((Number(quiz.passing_marks) / Number(quiz.total_marks)) * 10000) / 100 : 0,
        time_limit_minutes: quiz.time_limit_minutes,
        max_attempts: quiz.max_attempts,
        question_count: questionCount,
        course
      },
      ...(await attemptStats(quiz, req.user.id))
    }
  });
};

const loadQuestionsForStudent = (quizId) =>
  QuizQuestion.findAll({
    where: { quiz_id: quizId },
    attributes: ['id', 'question', 'question_type', 'marks', 'sort_order'],
    include: [{ model: QuizAnswer, as: 'answers', attributes: ['id', 'answer_text', 'sort_order'] }],
    order: [
      ['sort_order', 'ASC'],
      [{ model: QuizAnswer, as: 'answers' }, 'sort_order', 'ASC']
    ]
  });

/**
 * POST /student/quizzes/:quizId/start
 * Starts (or resumes) an attempt and returns the questions without answers keys.
 */
export const startAttempt = async (req, res) => {
  const quiz = await loadPublishedQuiz(req.params.quizId);
  const enrollment = await assertEnrolled(req.user.id, quiz.course_id);

  let attempt = await QuizAttempt.findOne({ where: { quiz_id: quiz.id, user_id: req.user.id, status: 'started' } });
  if (attempt) {
    const deadline = attemptDeadline(quiz, attempt);
    if (deadline && Date.now() > deadline.getTime() + LATE_GRACE_MS) {
      await attempt.update({ status: 'expired', submitted_at: deadline });
      attempt = null;
    }
  }

  if (!attempt) {
    attempt = await sequelize.transaction(async (transaction) => {
      const used = await QuizAttempt.count({ where: { quiz_id: quiz.id, user_id: req.user.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (quiz.max_attempts && used >= quiz.max_attempts) {
        throw ApiError.forbidden(`You have used all ${quiz.max_attempts} attempts for this quiz.`);
      }
      return QuizAttempt.create(
        { quiz_id: quiz.id, user_id: req.user.id, enrollment_id: enrollment.id, attempt_number: used + 1, started_at: new Date(), status: 'started' },
        { transaction }
      );
    });
  }

  const questions = await loadQuestionsForStudent(quiz.id);
  if (!questions.length) throw ApiError.badRequest('This quiz has no questions yet.');
  const deadline = attemptDeadline(quiz, attempt);

  return successResponse(res, {
    statusCode: 201,
    message: 'Quiz attempt started.',
    data: {
      attempt: { id: attempt.id, attempt_number: attempt.attempt_number, started_at: attempt.started_at, expires_at: deadline },
      remaining_seconds: deadline ? Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)) : null,
      quiz: { id: quiz.id, title: quiz.title, total_marks: quiz.total_marks, passing_marks: quiz.passing_marks, time_limit_minutes: quiz.time_limit_minutes },
      questions
    }
  });
};

/**
 * Grades submitted answers.
 * answers: [{ question_id, answer_id }] for single / true_false,
 *          [{ question_id, answer_ids: [..] }] for multiple choice (all-or-nothing).
 */
const gradeAnswers = (questions, answers) => {
  const byQuestion = new Map();
  for (const a of answers || []) {
    const qid = Number(a.question_id);
    const ids = Array.isArray(a.answer_ids) ? a.answer_ids : a.answer_id !== undefined && a.answer_id !== null ? [a.answer_id] : [];
    byQuestion.set(qid, [...new Set(ids.map(Number).filter(Boolean))]);
  }

  let score = 0;
  const rows = [];
  const breakdown = [];
  for (const q of questions) {
    const validIds = new Set(q.answers.map((a) => a.id));
    const chosen = (byQuestion.get(q.id) || []).filter((id) => validIds.has(id));
    const correctIds = q.answers.filter((a) => a.is_correct).map((a) => a.id);

    let isCorrect;
    if (q.question_type === 'multiple') {
      isCorrect = chosen.length === correctIds.length && chosen.every((id) => correctIds.includes(id));
    } else {
      isCorrect = chosen.length === 1 && correctIds.includes(chosen[0]);
    }
    const marks = isCorrect ? Number(q.marks) : 0;
    score += marks;

    if (chosen.length) {
      chosen.forEach((answerId, idx) =>
        rows.push({ question_id: q.id, answer_id: answerId, is_correct: isCorrect, marks_obtained: idx === 0 ? marks : 0 })
      );
    } else {
      rows.push({ question_id: q.id, answer_id: null, is_correct: false, marks_obtained: 0 });
    }
    breakdown.push({ question_id: q.id, selected_answer_ids: chosen, correct_answer_ids: correctIds, is_correct: isCorrect, marks_obtained: marks, marks: Number(q.marks) });
  }
  return { score: toMoney(score), rows, breakdown };
};

const finalizeAttempt = async (quiz, attempt, answers) => {
  const questions = await QuizQuestion.findAll({ where: { quiz_id: quiz.id }, include: [{ model: QuizAnswer, as: 'answers' }] });
  const { score, rows, breakdown } = gradeAnswers(questions, answers);
  const total = questions.reduce((s, q) => s + Number(q.marks), 0);
  const percentage = total ? toMoney((score / total) * 100) : 0;
  const deadline = attemptDeadline(quiz, attempt);
  const late = deadline && Date.now() > deadline.getTime() + LATE_GRACE_MS;
  const passed = !late && score >= Number(quiz.passing_marks);

  await sequelize.transaction(async (transaction) => {
    await QuizAttemptAnswer.destroy({ where: { attempt_id: attempt.id }, transaction });
    await QuizAttemptAnswer.bulkCreate(rows.map((r) => ({ ...r, attempt_id: attempt.id })), { transaction });
    await attempt.update({ score, percentage, passed, status: late ? 'expired' : 'submitted', submitted_at: new Date() }, { transaction });
  });

  await notifyUser(attempt.user_id, {
    title: passed ? 'Quiz passed' : 'Quiz result available',
    message: `You scored ${score}/${toMoney(total)} (${percentage}%) in "${quiz.title}" - ${passed ? 'passed' : late ? 'submitted after the time limit' : 'not passed'}.`,
    type: 'quiz_result',
    reference_type: 'quiz_attempt',
    reference_id: attempt.id
  });

  return {
    attempt_id: attempt.id,
    attempt_number: attempt.attempt_number,
    score,
    total_marks: toMoney(total),
    percentage,
    passing_marks: Number(quiz.passing_marks),
    passed,
    late_submission: Boolean(late),
    breakdown
  };
};

/** POST /student/quiz-attempts/:attemptId/submit { answers } */
export const submitAttempt = async (req, res) => {
  const attempt = await QuizAttempt.findOne({ where: { id: req.params.attemptId, user_id: req.user.id } });
  if (!attempt) throw ApiError.notFound('Attempt not found.');
  if (attempt.status !== 'started') throw ApiError.conflict('This attempt has already been submitted.');
  const quiz = await loadPublishedQuiz(attempt.quiz_id);
  await assertEnrolled(req.user.id, quiz.course_id);

  const result = await finalizeAttempt(quiz, attempt, req.body.answers);
  return successResponse(res, { message: 'Quiz submitted.', data: result });
};

/** POST /student/quizzes/:quizId/submit { answers } - start + submit in one call (untimed quizzes). */
export const submitQuizDirect = async (req, res) => {
  const quiz = await loadPublishedQuiz(req.params.quizId);
  const enrollment = await assertEnrolled(req.user.id, quiz.course_id);

  let attempt = await QuizAttempt.findOne({ where: { quiz_id: quiz.id, user_id: req.user.id, status: 'started' } });
  if (!attempt) {
    if (quiz.time_limit_minutes) throw ApiError.badRequest('This quiz is timed. Start an attempt first.');
    const used = await QuizAttempt.count({ where: { quiz_id: quiz.id, user_id: req.user.id } });
    if (quiz.max_attempts && used >= quiz.max_attempts) throw ApiError.forbidden(`You have used all ${quiz.max_attempts} attempts for this quiz.`);
    attempt = await QuizAttempt.create({ quiz_id: quiz.id, user_id: req.user.id, enrollment_id: enrollment.id, attempt_number: used + 1, started_at: new Date(), status: 'started' });
  }
  const result = await finalizeAttempt(quiz, attempt, req.body.answers);
  return successResponse(res, { message: 'Quiz submitted.', data: result });
};

/** GET /student/quizzes/:quizId/attempts - attempt history. */
export const listMyAttempts = async (req, res) => {
  const quiz = await loadPublishedQuiz(req.params.quizId);
  const stats = await attemptStats(quiz, req.user.id);
  return successResponse(res, { data: stats });
};

/** GET /student/quiz-attempts/:attemptId - result with correct answers (after submission). */
export const getAttemptResult = async (req, res) => {
  const attempt = await QuizAttempt.findOne({
    where: { id: req.params.attemptId, user_id: req.user.id },
    include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title', 'passing_marks', 'total_marks', 'course_id'] }]
  });
  if (!attempt) throw ApiError.notFound('Attempt not found.');
  if (attempt.status === 'started') throw ApiError.badRequest('Submit the attempt to see results.');

  const questions = await QuizQuestion.findAll({
    where: { quiz_id: attempt.quiz_id },
    include: [{ model: QuizAnswer, as: 'answers', attributes: ['id', 'answer_text', 'is_correct', 'sort_order'] }],
    order: [
      ['sort_order', 'ASC'],
      [{ model: QuizAnswer, as: 'answers' }, 'sort_order', 'ASC']
    ]
  });
  const given = await QuizAttemptAnswer.findAll({ where: { attempt_id: attempt.id } });
  const review = questions.map((q) => {
    const mine = given.filter((g) => g.question_id === q.id);
    return {
      id: q.id,
      question: q.question,
      question_type: q.question_type,
      marks: Number(q.marks),
      answers: q.answers,
      selected_answer_ids: mine.map((m) => m.answer_id).filter(Boolean),
      is_correct: mine.some((m) => m.is_correct),
      marks_obtained: mine.reduce((s, m) => s + Number(m.marks_obtained), 0)
    };
  });

  return successResponse(res, {
    data: {
      attempt: {
        id: attempt.id,
        attempt_number: attempt.attempt_number,
        status: attempt.status,
        score: Number(attempt.score),
        percentage: Number(attempt.percentage),
        passed: attempt.passed,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at
      },
      quiz: attempt.quiz,
      questions: review
    }
  });
};

/** GET /student/quiz-results - all of the student's quiz results across courses. */
export const listAllResults = async (req, res) => {
  const attempts = await QuizAttempt.findAll({
    where: { user_id: req.user.id, status: { [Op.in]: ['submitted', 'expired'] } },
    include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title', 'course_id', 'passing_marks', 'total_marks'], include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug'] }] }],
    order: [['submitted_at', 'DESC']]
  });
  return successResponse(res, { data: { attempts } });
};

export default {
  listCourseQuizzes,
  getQuiz,
  startAttempt,
  submitAttempt,
  submitQuizDirect,
  listMyAttempts,
  getAttemptResult,
  listAllResults
};
