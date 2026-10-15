import { sequelize } from '../config/database.js';

// Model imports
import Role from './Role.js';
import User from './User.js';
import UserProfile from './UserProfile.js';
import PasswordReset from './PasswordReset.js';
import EmailVerification from './EmailVerification.js';

import Category from './Category.js';
import Course from './Course.js';
import CourseTutor from './CourseTutor.js';
import CourseSection from './CourseSection.js';
import Lecture from './Lecture.js';
import CourseResource from './CourseResource.js';

import RecordedVideo from './RecordedVideo.js';
import VideoProgress from './VideoProgress.js';

import Enrollment from './Enrollment.js';
import LectureProgress from './LectureProgress.js';
import CourseProgress from './CourseProgress.js';

import Quiz from './Quiz.js';
import QuizQuestion from './QuizQuestion.js';
import QuizAnswer from './QuizAnswer.js';
import QuizAttempt from './QuizAttempt.js';
import QuizAttemptAnswer from './QuizAttemptAnswer.js';

import Project from './Project.js';
import ProjectSubmission from './ProjectSubmission.js';

import Certificate from './Certificate.js';

import LiveClass from './LiveClass.js';
import LiveClassTutor from './LiveClassTutor.js';
import UserSession from './UserSession.js';
import VideoPlayLog from './VideoPlayLog.js';
import LiveClassParticipant from './LiveClassParticipant.js';

import Cart from './Cart.js';
import CartItem from './CartItem.js';
import Order from './Order.js';
import OrderItem from './OrderItem.js';
import Payment from './Payment.js';
import Coupon from './Coupon.js';
import CouponUsage from './CouponUsage.js';
import StorePlan from './StorePlan.js';
import StorePlanCourse from './StorePlanCourse.js';
import StorePlanUpgrade from './StorePlanUpgrade.js';

import Wishlist from './Wishlist.js';
import Review from './Review.js';

import CommunityPost from './CommunityPost.js';
import CommunityComment from './CommunityComment.js';
import CommunityLike from './CommunityLike.js';

import Notification from './Notification.js';
import Communication from './Communication.js';

import CmsPage from './CmsPage.js';
import CmsContent from './CmsContent.js';
import Setting from './Setting.js';
import ReportExport from './ReportExport.js';
import FileModel from './FileModel.js';
import TutorPayout from './TutorPayout.js';
import ProgressActivity from './ProgressActivity.js';

// ==========================================
// 1. Authentication & User Relationships
// ==========================================
User.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(User, { foreignKey: 'role_id', as: 'users' });

User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'profile' });
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(PasswordReset, { foreignKey: 'user_id', as: 'passwordResets' });
PasswordReset.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(EmailVerification, { foreignKey: 'user_id', as: 'emailVerifications' });
EmailVerification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ==========================================
// 2. Course, Hierarchy & Curriculum Relationships
// ==========================================
Course.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Category.hasMany(Course, { foreignKey: 'category_id', as: 'courses' });

Course.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(Course, { foreignKey: 'created_by', as: 'createdCourses' });

Course.belongsToMany(User, { through: CourseTutor, foreignKey: 'course_id', otherKey: 'tutor_id', as: 'tutors' });
User.belongsToMany(Course, { through: CourseTutor, foreignKey: 'tutor_id', otherKey: 'course_id', as: 'tutoredCourses' });

Course.hasMany(CourseSection, { foreignKey: 'course_id', as: 'sections' });
CourseSection.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

CourseSection.hasMany(Lecture, { foreignKey: 'section_id', as: 'lectures' });
Lecture.belongsTo(CourseSection, { foreignKey: 'section_id', as: 'section' });

Course.hasMany(CourseResource, { foreignKey: 'course_id', as: 'resources' });
CourseResource.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Lecture.hasMany(CourseResource, { foreignKey: 'lecture_id', as: 'resources' });
CourseResource.belongsTo(Lecture, { foreignKey: 'lecture_id', as: 'lecture' });

// ==========================================
// 3. Recorded Videos & Playback
// ==========================================
RecordedVideo.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(RecordedVideo, { foreignKey: 'course_id', as: 'videos' });

RecordedVideo.belongsTo(CourseSection, { foreignKey: 'section_id', as: 'section' });
RecordedVideo.belongsTo(Lecture, { foreignKey: 'lecture_id', as: 'lecture' });
Lecture.hasOne(RecordedVideo, { foreignKey: 'lecture_id', as: 'video' });

RecordedVideo.hasMany(VideoProgress, { foreignKey: 'video_id', as: 'progressList' });
VideoProgress.belongsTo(RecordedVideo, { foreignKey: 'video_id', as: 'video' });
VideoProgress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ==========================================
// 4. Learning & Progress
// ==========================================
Enrollment.belongsTo(User, { foreignKey: 'user_id', as: 'student' });
User.hasMany(Enrollment, { foreignKey: 'user_id', as: 'enrollments' });

Enrollment.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(Enrollment, { foreignKey: 'course_id', as: 'enrollments' });

Enrollment.hasOne(CourseProgress, { foreignKey: 'enrollment_id', as: 'courseProgress' });
CourseProgress.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

Enrollment.hasMany(LectureProgress, { foreignKey: 'enrollment_id', as: 'lectureProgressList' });
LectureProgress.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
LectureProgress.belongsTo(Lecture, { foreignKey: 'lecture_id', as: 'lecture' });
LectureProgress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ==========================================
// 5. Quizzes & Assessments
// ==========================================
Quiz.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Quiz.hasMany(QuizQuestion, { foreignKey: 'quiz_id', as: 'questions' });
QuizQuestion.belongsTo(Quiz, { foreignKey: 'quiz_id', as: 'quiz' });

QuizQuestion.hasMany(QuizAnswer, { foreignKey: 'question_id', as: 'answers' });
QuizAnswer.belongsTo(QuizQuestion, { foreignKey: 'question_id', as: 'question' });

Quiz.hasMany(QuizAttempt, { foreignKey: 'quiz_id', as: 'attempts' });
QuizAttempt.belongsTo(Quiz, { foreignKey: 'quiz_id', as: 'quiz' });
QuizAttempt.belongsTo(User, { foreignKey: 'user_id', as: 'student' });
QuizAttempt.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

QuizAttempt.hasMany(QuizAttemptAnswer, { foreignKey: 'attempt_id', as: 'attemptAnswers' });
QuizAttemptAnswer.belongsTo(QuizAttempt, { foreignKey: 'attempt_id', as: 'attempt' });
QuizAttemptAnswer.belongsTo(QuizQuestion, { foreignKey: 'question_id', as: 'question' });

// ==========================================
// 6. Projects & Submissions
// ==========================================
Project.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(Project, { foreignKey: 'course_id', as: 'projects' });

Project.hasMany(ProjectSubmission, { foreignKey: 'project_id', as: 'submissions' });
ProjectSubmission.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
ProjectSubmission.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
ProjectSubmission.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
ProjectSubmission.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

// ==========================================
// 7. Certificates
// ==========================================
Certificate.belongsTo(User, { foreignKey: 'user_id', as: 'student' });
Certificate.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Certificate.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
Certificate.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// ==========================================
// 8. Live Classes (Zoom)
// ==========================================
LiveClass.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
LiveClass.belongsTo(Lecture, { foreignKey: 'lecture_id', as: 'lecture', constraints: false });
Lecture.hasOne(LiveClass, { foreignKey: 'lecture_id', as: 'liveClass', constraints: false });
LiveClass.belongsTo(User, { foreignKey: 'tutor_id', as: 'tutor' });
LiveClass.belongsToMany(User, { through: LiveClassTutor, foreignKey: 'live_class_id', otherKey: 'tutor_id', as: 'tutors' });
LiveClass.hasMany(LiveClassTutor, { foreignKey: 'live_class_id', as: 'tutorAssignments' });
User.hasMany(UserSession, { foreignKey: 'user_id', as: 'sessions' });
UserSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(VideoPlayLog, { foreignKey: 'user_id', as: 'videoPlays' });
VideoPlayLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
VideoPlayLog.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
VideoPlayLog.belongsTo(RecordedVideo, { foreignKey: 'video_id', as: 'video' });
LiveClass.hasMany(LiveClassParticipant, { foreignKey: 'live_class_id', as: 'participants' });
LiveClassParticipant.belongsTo(LiveClass, { foreignKey: 'live_class_id', as: 'liveClass' });
LiveClassParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ==========================================
// 9. E-Commerce, Orders & Payments
// ==========================================
Cart.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Cart.hasMany(CartItem, { foreignKey: 'cart_id', as: 'items' });
CartItem.belongsTo(Cart, { foreignKey: 'cart_id', as: 'cart' });
CartItem.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
OrderItem.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

Order.hasOne(Payment, { foreignKey: 'order_id', as: 'payment' });
Payment.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
Payment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Coupon.hasMany(CouponUsage, { foreignKey: 'coupon_id', as: 'usages' });

// Store plans: one WooCommerce product -> several courses
StorePlan.hasMany(StorePlanCourse, { foreignKey: 'plan_id', as: 'planCourses' });
StorePlanCourse.belongsTo(StorePlan, { foreignKey: 'plan_id', as: 'plan' });
StorePlanCourse.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(StorePlanCourse, { foreignKey: 'course_id', as: 'planLinks' });
CouponUsage.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'coupon' });
CouponUsage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
CouponUsage.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// ==========================================
// 10. Engagement, Reviews & Community
// ==========================================
Wishlist.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Wishlist.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

Review.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
Course.hasMany(Review, { foreignKey: 'course_id', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

CommunityPost.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
CommunityPost.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
CommunityPost.hasMany(CommunityComment, { foreignKey: 'post_id', as: 'comments' });
CommunityComment.belongsTo(CommunityPost, { foreignKey: 'post_id', as: 'post' });
CommunityComment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

CommunityPost.hasMany(CommunityLike, { foreignKey: 'post_id', as: 'likes' });
CommunityLike.belongsTo(CommunityPost, { foreignKey: 'post_id', as: 'post' });
CommunityLike.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ==========================================
// 11. Notifications & Communications
// ==========================================
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Communication.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Communication.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });

// ==========================================
// 12. Additional relationships used by tutor/admin panels
// ==========================================
Course.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });
Course.hasMany(CourseTutor, { foreignKey: 'course_id', as: 'courseTutors' });
CourseTutor.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
CourseTutor.belongsTo(User, { foreignKey: 'tutor_id', as: 'tutor' });
User.hasMany(CourseTutor, { foreignKey: 'tutor_id', as: 'courseAssignments' });

CourseSection.hasMany(RecordedVideo, { foreignKey: 'section_id', as: 'videos' });
RecordedVideo.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });
CourseResource.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });
Lecture.hasMany(LectureProgress, { foreignKey: 'lecture_id', as: 'progressRecords' });

Course.hasMany(Quiz, { foreignKey: 'course_id', as: 'quizzes' });
Quiz.belongsTo(CourseSection, { foreignKey: 'section_id', as: 'section' });
Quiz.belongsTo(Lecture, { foreignKey: 'lecture_id', as: 'lecture' });
Quiz.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Lecture.hasMany(Quiz, { foreignKey: 'lecture_id', as: 'quizzes' });
QuizAttemptAnswer.belongsTo(QuizAnswer, { foreignKey: 'answer_id', as: 'answer' });
User.hasMany(QuizAttempt, { foreignKey: 'user_id', as: 'quizAttempts' });

Project.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Enrollment.hasMany(ProjectSubmission, { foreignKey: 'enrollment_id', as: 'projectSubmissions' });
Enrollment.hasOne(Certificate, { foreignKey: 'enrollment_id', as: 'certificate' });
Enrollment.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
Course.hasMany(Certificate, { foreignKey: 'course_id', as: 'certificates' });
User.hasMany(Certificate, { foreignKey: 'user_id', as: 'certificates' });

Course.hasMany(LiveClass, { foreignKey: 'course_id', as: 'liveClasses' });
User.hasMany(LiveClassParticipant, { foreignKey: 'user_id', as: 'liveClassParticipations' });

Order.hasMany(Payment, { foreignKey: 'order_id', as: 'payments' });
Order.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'coupon' });
Order.hasMany(Enrollment, { foreignKey: 'order_id', as: 'enrollments' });
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Course.hasMany(OrderItem, { foreignKey: 'course_id', as: 'orderItems' });
Coupon.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

User.hasMany(Wishlist, { foreignKey: 'user_id', as: 'wishlist' });
Review.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
Review.belongsTo(User, { foreignKey: 'moderated_by', as: 'moderator' });
User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });

CommunityComment.hasMany(CommunityComment, { foreignKey: 'parent_comment_id', as: 'replies' });
CommunityComment.belongsTo(CommunityComment, { foreignKey: 'parent_comment_id', as: 'parent' });
User.hasMany(CommunityPost, { foreignKey: 'user_id', as: 'communityPosts' });

CmsPage.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
CmsPage.belongsTo(User, { foreignKey: 'updated_by', as: 'updater' });
CmsContent.belongsTo(User, { foreignKey: 'updated_by', as: 'updater' });
Setting.belongsTo(User, { foreignKey: 'updated_by', as: 'updater' });
ReportExport.belongsTo(User, { foreignKey: 'generated_by', as: 'generator' });
FileModel.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

TutorPayout.belongsTo(User, { foreignKey: 'tutor_id', as: 'tutor' });
TutorPayout.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(TutorPayout, { foreignKey: 'tutor_id', as: 'payouts' });

Enrollment.hasMany(ProgressActivity, { foreignKey: 'enrollment_id', as: 'progressActivities' });
ProgressActivity.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
ProgressActivity.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ProgressActivity.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });

export {
  sequelize,
  Role,
  User,
  UserProfile,
  PasswordReset,
  EmailVerification,
  Category,
  Course,
  CourseTutor,
  CourseSection,
  Lecture,
  CourseResource,
  RecordedVideo,
  VideoProgress,
  Enrollment,
  LectureProgress,
  CourseProgress,
  Quiz,
  QuizQuestion,
  QuizAnswer,
  QuizAttempt,
  QuizAttemptAnswer,
  Project,
  ProjectSubmission,
  Certificate,
  LiveClass,
  LiveClassTutor,
  UserSession,
  VideoPlayLog,
  LiveClassParticipant,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Payment,
  Coupon,
  CouponUsage,
  StorePlan,
  StorePlanCourse,
  StorePlanUpgrade,
  Wishlist,
  Review,
  CommunityPost,
  CommunityComment,
  CommunityLike,
  Notification,
  Communication,
  CmsPage,
  CmsContent,
  Setting,
  ReportExport,
  FileModel,
  TutorPayout,
  ProgressActivity
};

export default {
  sequelize,
  Role,
  User,
  UserProfile,
  PasswordReset,
  EmailVerification,
  Category,
  Course,
  CourseTutor,
  CourseSection,
  Lecture,
  CourseResource,
  RecordedVideo,
  VideoProgress,
  Enrollment,
  LectureProgress,
  CourseProgress,
  Quiz,
  QuizQuestion,
  QuizAnswer,
  QuizAttempt,
  QuizAttemptAnswer,
  Project,
  ProjectSubmission,
  Certificate,
  LiveClass,
  LiveClassTutor,
  UserSession,
  VideoPlayLog,
  LiveClassParticipant,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Payment,
  Coupon,
  CouponUsage,
  StorePlan,
  StorePlanCourse,
  StorePlanUpgrade,
  Wishlist,
  Review,
  CommunityPost,
  CommunityComment,
  CommunityLike,
  Notification,
  Communication,
  CmsPage,
  CmsContent,
  Setting,
  ReportExport,
  FileModel,
  TutorPayout,
  ProgressActivity
};
