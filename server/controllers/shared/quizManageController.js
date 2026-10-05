import { Op, fn, col } from 'sequelize';
import {
  sequelize,
  Quiz,
  QuizQuestion,
  QuizAnswer,
  QuizAttempt,
  QuizAttemptAnswer,
  CourseSection,
  Lecture,
  User
} from '../../models/index.js';
import { successResponse } from '../../utils/apiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { pick, toMoney, toBool } from '../../utils/helpers.js';
import { getPagination } from '../../utils/pagination.js';
import { assertCourseManager, isAdmin } from '../../services/accessService.js';

const QUIZ_FIELDS = ['title', 'description', 'passing_marks', 'time_limit_minutes', 'max_attempts', 'status'];

const STUDENT_ATTRS = ['id', 'first_name', 'last_name', 'email', 'profile_image'];

/** Validates a question payload, throwing a descriptive 422 on problems. */
const validateQuestion = (q, index = 0) => {
  const label = `Question ${index + 1}`;
  if (!q || !String(q.question || '').trim()) throw ApiError.unprocessable(`${label}: question text is required.`);
  const type = q.question_type || 'single';
  if (!['single', 'multiple', 'true_false'].includes(type)) throw ApiError.unprocessable(`${label}: invalid question_type.`);
  if (q.marks !== undefined && !(Number(q.marks) > 0)) throw ApiError.unprocessable(`${label}: marks must be greater than 0.`);

  let answers = Array.isArray(q.answers) ? q.answers : [];
  if (type === 'true_false' && !answers.length) {
    const correct = q.correct_answer === undefined ? null : toBool(q.correct_answer);
    if (correct === null) throw ApiError.unprocessable(`${label}: provide answers or correct_answer (true/false).`);
    answers = [
      { answer_text: 'True', is_correct: correct },
      { answer_text: 'False', is_correct: !correct }
    ];
  }
  if (answers.length < 2) throw ApiError.unprocessable(`${label}: at least two answer options are required.`);
  if (answers.some((a) => !String(a.answer_text || '').trim())) throw ApiError.unprocessable(`${label}: answer text cannot be empty.`);
  const correctCount = answers.filter((a) => toBool(a.is_correct)).length;
  if (type === 'multiple' && correctCount < 1) throw ApiError.unprocessable(`${label}: mark at least one correct answer.`);
  if (type !== 'multiple' && correctCount !== 1) throw ApiError.unprocessable(`${label}: exactly one answer must be correct.`);
  if (type === 'true_false' && answers.length !== 2) throw ApiError.unprocessable(`${label}: true/false questions need exactly two answers.`);
  return { ...q, question_type: type, answers };
};

const createQuestionWithAnswers = async (quizId, q, sortOrder, transaction) => {
  const question = await QuizQuestion.create(
    {
      quiz_id: quizId,
      question: q.question,
      question_type: q.question_type,
      marks: q.marks !== undefined ? Number(q.marks) : 1,
      sort_order: q.sort_order !== undefined ? Number(q.sort_order) : sortOrder
    },
    { transaction }
  );
  await QuizAnswer.bulkCreate(
    q.answers.map((a, i) => ({
      question_id: question.id,
      answer_text: a.answer_text,
      is_correct: toBool(a.is_correct),
      sort_order: a.sort_order !== undefined ? Number(a.sort_order) : i + 1
    })),
    { transaction }
  );
  return question;
};

/** Keeps quizzes.total_marks equal to the sum of question marks. */
const syncTotalMarks = async (quizId, transaction = null) => {
  const total = (await QuizQuestion.sum('marks', { where: { quiz_id: quizId }, transaction })) || 0;
  await Quiz.update({ total_marks: toMoney(total) }, { where: { id: quizId }, transaction });
  return total;
};

const assertPlacement = async (courseId, sectionId, lectureId) => {
  if (sectionId) {
    const section = await CourseSection.findByPk(sectionId);
    if (!section || section.course_id !== Number(courseId)) throw ApiError.badRequest('section_id must belong to this course.');
  }
  if (lectureId) {
    const lecture = await Lecture.findByPk(lectureId, { include: [{ model: CourseSection, as: 'section' }] });
    if (!lecture || lecture.section.course_id !== Number(courseId)) throw ApiError.badRequest('lecture_id must belong to this course.');
  }
};

const findQuizForManager = async (user, quizId) => {
  const quiz = await Quiz.findByPk(quizId);
  if (!quiz) throw ApiError.notFound('Quiz not found.');
  await assertCourseManager(user, quiz.course_id);
  return quiz;
};

const loadQuizFull = (quizId) =>
  Quiz.findByPk(quizId, {
    include: [
      { model: CourseSection, as: 'section', attributes: ['id', 'title'] },
      { model: Lecture, as: 'lecture', attributes: ['id', 'title'] },
      { model: QuizQuestion, as: 'questions', include: [{ model: QuizAnswer, as: 'answers' }] }
    ],
    order: [
      [{ model: QuizQuestion, as: 'questions' }, 'sort_order', 'ASC'],
      [{ model: QuizQuestion, as: 'questions' }, { model: QuizAnswer, as: 'answers' }, 'sort_order', 'ASC']
    ]
  });

/** GET /courses/:courseId/quizzes */
export const listCourseQuizzes = async (req, res) => {
  await assertCourseManager(req.user, req.params.courseId);
  const quizzes = await Quiz.findAll({
    where: { course_id: req.params.courseId },
    attributes: {
      include: [
        [sequelize.literal('(SELECT COUNT(*) FROM quiz_questions q WHERE q.quiz_id = `Quiz`.`id`)'), 'question_count'],
        [sequelize.literal("(SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id = `Quiz`.`id` AND a.status = 'submitted')"), 'attempt_count']
      ]
    },
    include: [
      { model: CourseSection, as: 'section', attributes: ['id', 'title'] },
      { model: Lecture, as: 'lecture', attributes: ['id', 'title'] }
    ],
    order: [['created_at', 'ASC']]
  });
  return successResponse(res, { data: { quizzes } });
};

/**
 * POST /courses/:courseId/quizzes
 * { title, description, section_id, lecture_id, passing_marks, time_limit_minutes,
 *   max_attempts, status, questions: [{ question, question_type, marks, answers: [{ answer_text, is_correct }] }] }
 * passing_marks is in marks (not %); use passing_percentage to derive it from total.
 */
export const createQuiz = async (req, res) => {
  const course = await assertCourseManager(req.user, req.params.courseId);
  await assertPlacement(course.id, req.body.section_id, req.body.lecture_id);
  const questions = (req.body.questions || []).map(validateQuestion);
  if ((req.body.status || 'draft') === 'published' && !questions.length) {
    throw ApiError.badRequest('A published quiz needs at least one question.');
  }

  const quizId = await sequelize.transaction(async (transaction) => {
    const quiz = await Quiz.create(
      {
        ...pick(req.body, QUIZ_FIELDS),
        course_id: course.id,
        section_id: req.body.section_id || null,
        lecture_id: req.body.lecture_id || null,
        created_by: req.user.id,
        passing_marks: req.body.passing_marks || 0,
        status: req.body.status || 'draft'
      },
      { transaction }
    );
    for (let i = 0; i < questions.length; i += 1) {
      await createQuestionWithAnswers(quiz.id, questions[i], i + 1, transaction);
    }
    const total = await syncTotalMarks(quiz.id, transaction);
    if (req.body.passing_percentage !== undefined) {
      await quiz.update({ passing_marks: toMoney((total * Number(req.body.passing_percentage)) / 100) }, { transaction });
    } else if (Number(quiz.passing_marks) > total && total > 0) {
      throw ApiError.badRequest(`passing_marks (${quiz.passing_marks}) cannot exceed total marks (${total}).`);
    }
    return quiz.id;
  });

  return successResponse(res, { statusCode: 201, message: 'Quiz created.', data: { quiz: await loadQuizFull(quizId) } });
};

/** GET /quizzes/:quizId - full quiz incl. correct answers. */
export const getQuizForManage = async (req, res) => {
  await findQuizForManager(req.user, req.params.quizId);
  return successResponse(res, { data: { quiz: await loadQuizFull(req.params.quizId) } });
};

/** PUT /quizzes/:quizId (settings; pass `questions` to replace all questions when no attempts exist) */
export const updateQuiz = async (req, res) => {
  const quiz = await findQuizForManager(req.user, req.params.quizId);
  await assertPlacement(quiz.course_id, req.body.section_id, req.body.lecture_id);

  const data = pick(req.body, QUIZ_FIELDS);
  if (req.body.section_id !== undefined) data.section_id = req.body.section_id || null;
  if (req.body.lecture_id !== undefined) data.lecture_id = req.body.lecture_id || null;
  if (data.max_attempts === '' || data.max_attempts === 0) data.max_attempts = null;
  if (data.time_limit_minutes === '' || data.time_limit_minutes === 0) data.time_limit_minutes = null;

  await sequelize.transaction(async (transaction) => {
    if (Array.isArray(req.body.questions)) {
      const attempts = await QuizAttempt.count({ where: { quiz_id: quiz.id }, transaction });
      if (attempts) throw ApiError.conflict('This quiz already has attempts. Edit questions individually instead of replacing them.');
      const questions = req.body.questions.map(validateQuestion);
      await QuizQuestion.destroy({ where: { quiz_id: quiz.id }, transaction });
      for (let i = 0; i < questions.length; i += 1) await createQuestionWithAnswers(quiz.id, questions[i], i + 1, transaction);
    }
    await quiz.update(data, { transaction });
    const total = await syncTotalMarks(quiz.id, transaction);
    if (req.body.passing_percentage !== undefined) {
      await quiz.update({ passing_marks: toMoney((total * Number(req.body.passing_percentage)) / 100) }, { transaction });
    } else if (Number(quiz.passing_marks) > total && total > 0) {
      throw ApiError.badRequest(`passing_marks (${quiz.passing_marks}) cannot exceed total marks (${total}).`);
    }
    if (quiz.status === 'published' && total === 0) throw ApiError.badRequest('A published quiz needs at least one question.');
  });

  return successResponse(res, { message: 'Quiz updated.', data: { quiz: await loadQuizFull(quiz.id) } });
};

/** DELETE /quizzes/:quizId - blocked once students have attempted it (set it inactive instead). */
export const deleteQuiz = async (req, res) => {
  const quiz = await findQuizForManager(req.user, req.params.quizId);
  const attempts = await QuizAttempt.count({ where: { quiz_id: quiz.id } });
  if (attempts && !(isAdmin(req.user) && toBool(req.query.force))) {
    throw ApiError.conflict('Students have attempted this quiz. Set it to inactive instead of deleting it.');
  }
  await sequelize.transaction(async (transaction) => {
    const attemptIds = (await QuizAttempt.findAll({ where: { quiz_id: quiz.id }, attributes: ['id'], transaction })).map((a) => a.id);
    if (attemptIds.length) {
      await QuizAttemptAnswer.destroy({ where: { attempt_id: { [Op.in]: attemptIds } }, transaction });
      await QuizAttempt.destroy({ where: { id: { [Op.in]: attemptIds } }, transaction });
    }
    await quiz.destroy({ transaction });
  });
  return successResponse(res, { message: 'Quiz deleted.' });
};

/** POST /quizzes/:quizId/questions */
export const addQuestion = async (req, res) => {
  const quiz = await findQuizForManager(req.user, req.params.quizId);
  const q = validateQuestion(req.body);
  const question = await sequelize.transaction(async (transaction) => {
    const maxOrder = (await QuizQuestion.max('sort_order', { where: { quiz_id: quiz.id }, transaction })) || 0;
    const created = await createQuestionWithAnswers(quiz.id, q, maxOrder + 1, transaction);
    await syncTotalMarks(quiz.id, transaction);
    return created;
  });
  const full = await QuizQuestion.findByPk(question.id, { include: [{ model: QuizAnswer, as: 'answers' }] });
  return successResponse(res, { statusCode: 201, message: 'Question added.', data: { question: full } });
};

const findQuestionForManager = async (user, questionId) => {
  const question = await QuizQuestion.findByPk(questionId, { include: [{ model: QuizAnswer, as: 'answers' }] });
  if (!question) throw ApiError.notFound('Question not found.');
  await findQuizForManager(user, question.quiz_id);
  return question;
};

/**
 * PUT /questions/:questionId
 * Pass `answers` to replace the options. Answers that were already chosen in
 * attempts are kept but detached (attempt history stays intact).
 */
export const updateQuestion = async (req, res) => {
  const question = await findQuestionForManager(req.user, req.params.questionId);
  const merged = {
    question: req.body.question ?? question.question,
    question_type: req.body.question_type ?? question.question_type,
    marks: req.body.marks ?? question.marks,
    answers: req.body.answers ?? question.answers.map((a) => ({ answer_text: a.answer_text, is_correct: a.is_correct })),
    correct_answer: req.body.correct_answer
  };
  const q = validateQuestion(merged);

  await sequelize.transaction(async (transaction) => {
    await question.update(
      { question: q.question, question_type: q.question_type, marks: Number(q.marks), ...(req.body.sort_order !== undefined && { sort_order: Number(req.body.sort_order) }) },
      { transaction }
    );
    if (req.body.answers || req.body.correct_answer !== undefined) {
      await QuizAnswer.destroy({ where: { question_id: question.id }, transaction }); // attempt answers: ON DELETE SET NULL
      await QuizAnswer.bulkCreate(
        q.answers.map((a, i) => ({ question_id: question.id, answer_text: a.answer_text, is_correct: toBool(a.is_correct), sort_order: i + 1 })),
        { transaction }
      );
    }
    await syncTotalMarks(question.quiz_id, transaction);
  });
  const full = await QuizQuestion.findByPk(question.id, { include: [{ model: QuizAnswer, as: 'answers' }] });
  return successResponse(res, { message: 'Question updated.', data: { question: full } });
};

/** DELETE /questions/:questionId */
export const deleteQuestion = async (req, res) => {
  const question = await findQuestionForManager(req.user, req.params.questionId);
  const used = await QuizAttemptAnswer.count({ where: { question_id: question.id } });
  if (used) throw ApiError.conflict('This question has been answered in student attempts and cannot be deleted.');
  await sequelize.transaction(async (transaction) => {
    await question.destroy({ transaction });
    await syncTotalMarks(question.quiz_id, transaction);
  });
  return successResponse(res, { message: 'Question deleted.' });
};

/** PUT /quizzes/:quizId/questions/reorder { question_ids: [...] } */
export const reorderQuestions = async (req, res) => {
  const quiz = await findQuizForManager(req.user, req.params.quizId);
  const ids = (req.body.question_ids || []).map(Number);
  const existing = new Set((await QuizQuestion.findAll({ where: { quiz_id: quiz.id }, attributes: ['id'] })).map((q) => q.id));
  if (!ids.length || ids.some((id) => !existing.has(id))) throw ApiError.badRequest('question_ids must list questions of this quiz.');
  await sequelize.transaction(async (transaction) => {
    for (let i = 0; i < ids.length; i += 1) await QuizQuestion.update({ sort_order: i + 1 }, { where: { id: ids[i] }, transaction });
  });
  return successResponse(res, { message: 'Questions reordered.' });
};

/** GET /quizzes/:quizId/results - attempts, per-student best score and summary. */
export const getQuizResults = async (req, res) => {
  const quiz = await findQuizForManager(req.user, req.params.quizId);
  const { limit, offset, meta } = getPagination(req.query, 50);
  const where = { quiz_id: quiz.id, status: 'submitted' };
  if (req.query.passed !== undefined) where.passed = toBool(req.query.passed);
  if (req.query.user_id) where.user_id = req.query.user_id;

  const [{ count, rows }, summary, perStudent] = await Promise.all([
    QuizAttempt.findAndCountAll({
      where,
      include: [{ model: User, as: 'student', attributes: STUDENT_ATTRS }],
      order: [['submitted_at', 'DESC']],
      limit,
      offset
    }),
    QuizAttempt.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'attempts'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'students'],
        [fn('AVG', col('percentage')), 'average_percentage'],
        [fn('MAX', col('percentage')), 'highest_percentage'],
        [fn('SUM', sequelize.literal('CASE WHEN passed = 1 THEN 1 ELSE 0 END')), 'passed_attempts']
      ],
      where: { quiz_id: quiz.id, status: 'submitted' },
      raw: true
    }),
    QuizAttempt.findAll({
      attributes: ['user_id', [fn('MAX', col('percentage')), 'best_percentage'], [fn('MAX', col('score')), 'best_score'], [fn('MAX', col('passed')), 'has_passed'], [fn('COUNT', col('id')), 'attempts']],
      where: { quiz_id: quiz.id, status: 'submitted' },
      group: ['user_id'],
      raw: true
    })
  ]);

  const passedStudents = perStudent.filter((s) => Number(s.has_passed) === 1).length;
  return successResponse(res, {
    data: {
      quiz: { id: quiz.id, title: quiz.title, total_marks: quiz.total_marks, passing_marks: quiz.passing_marks },
      summary: {
        attempts: Number(summary.attempts || 0),
        students: Number(summary.students || 0),
        students_passed: passedStudents,
        pass_rate: perStudent.length ? Math.round((passedStudents / perStudent.length) * 10000) / 100 : 0,
        average_percentage: Math.round(Number(summary.average_percentage || 0) * 100) / 100,
        highest_percentage: Number(summary.highest_percentage || 0)
      },
      attempts: rows
    },
    meta: meta(count)
  });
};

/** GET /quiz-attempts/:attemptId - a student's attempt with chosen and correct answers. */
export const getAttemptDetail = async (req, res) => {
  const attempt = await QuizAttempt.findByPk(req.params.attemptId, {
    include: [
      { model: User, as: 'student', attributes: STUDENT_ATTRS },
      { model: QuizAttemptAnswer, as: 'attemptAnswers', include: [{ model: QuizQuestion, as: 'question', include: [{ model: QuizAnswer, as: 'answers' }] }, { model: QuizAnswer, as: 'answer' }] }
    ]
  });
  if (!attempt) throw ApiError.notFound('Attempt not found.');
  await findQuizForManager(req.user, attempt.quiz_id);
  return successResponse(res, { data: { attempt } });
};

export default {
  listCourseQuizzes,
  createQuiz,
  getQuizForManage,
  updateQuiz,
  deleteQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getQuizResults,
  getAttemptDetail
};
