/**
 * Reusable OpenAPI 3.0 Schemas for ATV Academy LMS
 */

export const schemas = {
  ApiResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Operation completed successfully.' },
      data: { type: 'object', nullable: true },
      meta: { $ref: '#/components/schemas/PaginationMeta' }
    }
  },

  ApiError: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Validation failed or resource not found.' },
      errors: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', example: 'email' },
            message: { type: 'string', example: 'A valid email is required.' },
            code: { type: 'string', example: 'INVALID_FORMAT' }
          }
        }
      }
    }
  },

  PaginationMeta: {
    type: 'object',
    properties: {
      total: { type: 'integer', example: 45 },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
      totalPages: { type: 'integer', example: 3 }
    }
  },

  User: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      role_id: { type: 'integer', example: 2 },
      role_name: { type: 'string', enum: ['student', 'tutor', 'admin'], example: 'student' },
      first_name: { type: 'string', example: 'John' },
      last_name: { type: 'string', nullable: true, example: 'Doe' },
      email: { type: 'string', format: 'email', example: 'john.doe@example.com' },
      phone: { type: 'string', nullable: true, example: '+919876543210' },
      profile_image: { type: 'string', nullable: true, example: 'http://localhost:5000/uploads/images/avatar.jpg' },
      status: { type: 'string', enum: ['active', 'inactive', 'blocked', 'pending'], example: 'active' },
      is_email_verified: { type: 'boolean', example: true },
      email_verified_at: { type: 'string', format: 'date-time', nullable: true },
      phone_verified_at: { type: 'string', format: 'date-time', nullable: true },
      last_login_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
      profile: { $ref: '#/components/schemas/UserProfile' }
    }
  },

  UserProfile: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      user_id: { type: 'integer', example: 1 },
      bio: { type: 'string', nullable: true, example: 'Full-stack developer and AI enthusiast.' },
      date_of_birth: { type: 'string', format: 'date', nullable: true, example: '1995-05-15' },
      gender: { type: 'string', nullable: true, enum: ['male', 'female', 'other'] },
      address: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true, example: 'Mumbai' },
      state: { type: 'string', nullable: true, example: 'Maharashtra' },
      country: { type: 'string', nullable: true, example: 'India' },
      postal_code: { type: 'string', nullable: true, example: '400001' },
      website: { type: 'string', format: 'uri', nullable: true, example: 'https://johndoe.dev' },
      linkedin_url: { type: 'string', format: 'uri', nullable: true, example: 'https://linkedin.com/in/johndoe' }
    }
  },

  Category: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      name: { type: 'string', example: 'Web Development' },
      slug: { type: 'string', example: 'web-development' },
      description: { type: 'string', nullable: true, example: 'Master HTML, CSS, JavaScript, React, Node.js, and modern web frameworks.' },
      image_url: { type: 'string', nullable: true, example: 'http://localhost:5000/uploads/images/categories/web-dev.png' },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      course_count: { type: 'integer', example: 12 },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  Course: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 10 },
      category_id: { type: 'integer', example: 1 },
      created_by: { type: 'integer', example: 2 },
      title: { type: 'string', example: 'Complete Full-Stack MERN Architecture' },
      slug: { type: 'string', example: 'complete-full-stack-mern-architecture' },
      short_description: { type: 'string', nullable: true, example: 'Build scalable modern web applications from scratch.' },
      description: { type: 'string', nullable: true, example: 'Comprehensive course covering frontend, backend, databases, and deployment.' },
      thumbnail_url: { type: 'string', nullable: true, example: 'http://localhost:5000/uploads/images/courses/mern.jpg' },
      price: { type: 'number', example: 4999.00 },
      discount_price: { type: 'number', nullable: true, example: 2499.00 },
      effective_price: { type: 'number', example: 2499.00 },
      duration_minutes: { type: 'integer', nullable: true, example: 1800 },
      level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'all'], example: 'intermediate' },
      language: { type: 'string', example: 'English' },
      status: { type: 'string', enum: ['draft', 'pending', 'approved', 'published', 'rejected', 'archived'], example: 'published' },
      approval_note: { type: 'string', nullable: true },
      approved_by: { type: 'integer', nullable: true },
      approved_at: { type: 'string', format: 'date-time', nullable: true },
      published_at: { type: 'string', format: 'date-time', nullable: true },
      category: { $ref: '#/components/schemas/Category' },
      tutors: {
        type: 'array',
        items: { $ref: '#/components/schemas/User' }
      },
      sections: {
        type: 'array',
        items: { $ref: '#/components/schemas/CourseSection' }
      },
      student_count: { type: 'integer', example: 320 },
      rating: { type: 'number', example: 4.8 },
      review_count: { type: 'integer', example: 85 }
    }
  },

  CourseSection: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 101 },
      course_id: { type: 'integer', example: 10 },
      title: { type: 'string', example: 'Section 1: Foundations & Architecture' },
      description: { type: 'string', nullable: true, example: 'Setting up the environment and core principles.' },
      sort_order: { type: 'integer', example: 1 },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      lectures: {
        type: 'array',
        items: { $ref: '#/components/schemas/Lecture' }
      }
    }
  },

  Lecture: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 501 },
      section_id: { type: 'integer', example: 101 },
      title: { type: 'string', example: '01. High-Level System Architecture' },
      description: { type: 'string', nullable: true },
      lecture_type: { type: 'string', enum: ['video', 'text', 'document', 'quiz', 'live_class'], example: 'video' },
      duration_seconds: { type: 'integer', example: 1200 },
      is_preview: { type: 'boolean', example: true },
      sort_order: { type: 'integer', example: 1 },
      status: { type: 'string', enum: ['draft', 'published', 'inactive'], example: 'published' },
      video: { $ref: '#/components/schemas/RecordedVideo' },
      resources: {
        type: 'array',
        items: { $ref: '#/components/schemas/CourseResource' }
      },
      quizzes: {
        type: 'array',
        items: { $ref: '#/components/schemas/Quiz' }
      },
      progress: {
        type: 'object',
        properties: {
          completed: { type: 'boolean', example: true },
          completion_percentage: { type: 'number', example: 100 },
          watched_seconds: { type: 'number', example: 1200 },
          last_position_seconds: { type: 'number', example: 1200 }
        }
      }
    }
  },

  RecordedVideo: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 301 },
      course_id: { type: 'integer', example: 10 },
      section_id: { type: 'integer', nullable: true, example: 101 },
      lecture_id: { type: 'integer', nullable: true, example: 501 },
      title: { type: 'string', example: 'System Architecture Lecture Video' },
      description: { type: 'string', nullable: true },
      duration_seconds: { type: 'integer', example: 1200 },
      thumbnail_url: { type: 'string', nullable: true },
      mime_type: { type: 'string', example: 'video/mp4' },
      vimeo_video_id: { type: 'string', nullable: true, example: '1012345678', description: 'Numeric Vimeo video id (null for local / external videos)' },
      video_url: {
        type: 'string',
        example: 'https://player.vimeo.com/video/1012345678?h=4f1e2c3b5a',
        description: 'Stored location: Vimeo player embed URL for Vimeo videos, API stream path for local files, or the external URL'
      },
      stream_url: {
        type: 'string',
        example: 'https://player.vimeo.com/video/1012345678?h=4f1e2c3b5a&title=0&byline=0&portrait=0&badge=0&dnt=1&autopause=0',
        description: 'What to give the player: Vimeo embed URL (use in an <iframe> or with @vimeo/player), or /api/v1/media/videos/:id/stream?token= for local files'
      },
      is_external: { type: 'boolean', example: false },
      playback: { $ref: '#/components/schemas/VideoPlayback' },
      status: {
        type: 'string',
        enum: ['processing', 'ready', 'failed', 'published', 'unpublished', 'deleted'],
        example: 'ready',
        description: 'processing = Vimeo is still transcoding (not playable yet); ready/published = playable; failed = Vimeo could not process the file'
      }
    }
  },

  VideoPlayback: {
    type: 'object',
    description: `Playback info returned to authorised viewers only (enrolled students, course tutors, admins).
For **vimeo** embed \`embed_url\` in an <iframe> (allow="autoplay; fullscreen; picture-in-picture"), or load it with the \`@vimeo/player\` SDK
call POST /student/lectures/{lectureId}/play on its \`play\` event (adds course progress), and send \`timeupdate\` seconds to POST /student/lectures/{lectureId}/progress for resume position.
Videos are hidden on vimeo.com (embed-only) and can be restricted to your domains with VIMEO_EMBED_DOMAINS.
\`hls_url\` / \`mp4_url\` are only filled when VIMEO_USE_DIRECT_LINKS=true and your Vimeo plan allows file access (links expire at \`expires_at\`).`,
    properties: {
      provider: { type: 'string', enum: ['vimeo', 'local', 'external'], example: 'vimeo' },
      ready: { type: 'boolean', example: true },
      vimeo_video_id: { type: 'string', example: '1012345678' },
      embed_url: { type: 'string', example: 'https://player.vimeo.com/video/1012345678?h=4f1e2c3b5a&title=0&byline=0&portrait=0&badge=0&dnt=1&autopause=0' },
      iframe_url: { type: 'string', description: 'Same as embed_url' },
      stream_url: { type: 'string', description: 'Same as embed_url for Vimeo; signed API URL for local files' },
      hls_url: { type: 'string', nullable: true, example: null },
      mp4_url: { type: 'string', nullable: true, example: null },
      thumbnail_url: { type: 'string', example: 'https://i.vimeocdn.com/video/1912345678-abc_640' },
      expires_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  CourseProgressSummary: {
    type: 'object',
    description: `Course progress under the **90% completion rule**:
1. **0% -> 90%** - each counted recorded-video play or live-class join adds \`increment_percentage\`; capped at \`progress_cap_percentage\` (90).
2. **90% -> Pending Approval** - the final project unlocks; after submission \`status = pending_approval\` (still 90%).
3. **Approval -> 100%** - \`status = completed\`, certificate available. A rejection gives \`resubmission_required\` (stays 90%, resubmit allowed).`,
    properties: {
      completion_percentage: { type: 'number', example: 90, description: 'Overall course % shown to the student (100 only after approval)' },
      auto_progress_percentage: { type: 'number', example: 90 },
      progress_cap_percentage: { type: 'number', example: 90 },
      increment_percentage: { type: 'number', example: 10 },
      status: { type: 'string', enum: ['not_started', 'in_progress', 'project_unlocked', 'pending_approval', 'resubmission_required', 'completed'], example: 'pending_approval' },
      status_label: { type: 'string', example: 'Pending Approval' },
      requires_project: { type: 'boolean', example: true },
      can_submit_project: { type: 'boolean', example: false },
      eligible_for_final_project: { type: 'boolean', example: true },
      project_submission_status: { type: 'string', nullable: true, enum: ['submitted', 'under_review', 'approved', 'rejected', 'resubmission_required', null], example: 'submitted' },
      certificate_available: { type: 'boolean', example: false }
    }
  },

  ProgressActivityResult: {
    type: 'object',
    properties: {
      counted: { type: 'boolean', example: true },
      reason: { type: 'string', nullable: true, enum: [null, 'already_counted_recently', 'cap_reached', 'course_completed', 'not_enrolled'], example: null },
      increment_applied: { type: 'number', example: 10 },
      progress: { $ref: '#/components/schemas/CourseProgressSummary' }
    }
  },

  VideoDirectUpload: {
    type: 'object',
    description: `Vimeo upload target for direct browser uploads (the file never passes through the API).
Upload with tus-js-client:
\`new tus.Upload(file, { uploadUrl: upload.url, chunkSize: 64 * 1024 * 1024, onSuccess: () => ... }).start()\`
After the upload the video is \`processing\`; it switches to \`ready\` automatically (background sync every 5 minutes) or via POST /videos/{videoId}/sync.`,
    properties: {
      method: { type: 'string', enum: ['tus'], example: 'tus' },
      url: { type: 'string', example: 'https://asia-files.tus.vimeo.com/files/vimeo-prod-src-tus-asia/abc123' },
      video_id: { type: 'string', example: '1012345678', description: 'Vimeo video id (also saved as recorded_videos.vimeo_video_id)' },
      embed_url: { type: 'string', example: 'https://player.vimeo.com/video/1012345678?h=4f1e2c3b5a' },
      expires_at: { type: 'string', format: 'date-time' }
    }
  },

  CourseResource: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 801 },
      course_id: { type: 'integer', example: 10 },
      lecture_id: { type: 'integer', nullable: true, example: 501 },
      title: { type: 'string', example: 'Architecture Cheatsheet (PDF)' },
      file_name: { type: 'string', example: 'architecture-cheatsheet.pdf' },
      file_type: { type: 'string', example: 'application/pdf' },
      file_size: { type: 'integer', example: 2048500 },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
      download_url: { type: 'string', example: '/api/v1/student/resources/801/download' }
    }
  },

  Quiz: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 20 },
      course_id: { type: 'integer', example: 10 },
      section_id: { type: 'integer', nullable: true, example: 101 },
      lecture_id: { type: 'integer', nullable: true, example: 501 },
      title: { type: 'string', example: 'Module 1 Assessment' },
      description: { type: 'string', nullable: true, example: 'Test your understanding of core concepts.' },
      passing_marks: { type: 'number', example: 8.00 },
      total_marks: { type: 'number', example: 10.00 },
      passing_percentage: { type: 'number', example: 80.0 },
      time_limit_minutes: { type: 'integer', nullable: true, example: 20 },
      max_attempts: { type: 'integer', nullable: true, example: 3 },
      status: { type: 'string', enum: ['draft', 'published', 'inactive'], example: 'published' },
      question_count: { type: 'integer', example: 10 },
      questions: {
        type: 'array',
        items: { $ref: '#/components/schemas/QuizQuestion' }
      }
    }
  },

  QuizQuestion: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      quiz_id: { type: 'integer', example: 20 },
      question: { type: 'string', example: 'Which of the following is true about Node.js event loop?' },
      question_type: { type: 'string', enum: ['single', 'multiple', 'true_false'], example: 'single' },
      marks: { type: 'number', example: 1.00 },
      sort_order: { type: 'integer', example: 1 },
      answers: {
        type: 'array',
        items: { $ref: '#/components/schemas/QuizAnswer' }
      }
    }
  },

  QuizAnswer: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 101 },
      question_id: { type: 'integer', example: 1 },
      answer_text: { type: 'string', example: 'It executes in a single-threaded event-driven loop.' },
      is_correct: { type: 'boolean', example: true },
      sort_order: { type: 'integer', example: 1 }
    }
  },

  QuizAttempt: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 901 },
      quiz_id: { type: 'integer', example: 20 },
      user_id: { type: 'integer', example: 1 },
      enrollment_id: { type: 'integer', example: 50 },
      attempt_number: { type: 'integer', example: 1 },
      score: { type: 'number', example: 9.00 },
      percentage: { type: 'number', example: 90.00 },
      passed: { type: 'boolean', example: true },
      status: { type: 'string', enum: ['started', 'submitted', 'expired', 'abandoned'], example: 'submitted' },
      started_at: { type: 'string', format: 'date-time' },
      submitted_at: { type: 'string', format: 'date-time', nullable: true },
      breakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question_id: { type: 'integer' },
            selected_answer_ids: { type: 'array', items: { type: 'integer' } },
            correct_answer_ids: { type: 'array', items: { type: 'integer' } },
            is_correct: { type: 'boolean' },
            marks_obtained: { type: 'number' }
          }
        }
      }
    }
  },

  Project: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 5 },
      course_id: { type: 'integer', example: 10 },
      title: { type: 'string', example: 'Capstone: Production SaaS Platform' },
      instructions: { type: 'string', example: 'Build and deploy a full-featured multi-tenant SaaS application.' },
      allowed_file_types: {
        type: 'array',
        items: { type: 'string' },
        example: ['zip', 'tar', 'gz', 'pdf']
      },
      max_file_size: { type: 'integer', example: 52428800, description: 'Size in bytes (50MB)' },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' }
    }
  },

  ProjectSubmission: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 75 },
      project_id: { type: 'integer', example: 5 },
      student_id: { type: 'integer', example: 1 },
      enrollment_id: { type: 'integer', example: 50 },
      file_name: { type: 'string', example: 'john_doe_capstone_project.zip' },
      file_size: { type: 'integer', example: 18450000 },
      submission_note: { type: 'string', nullable: true, example: 'Includes live deployment link and architecture diagram.' },
      status: { type: 'string', enum: ['submitted', 'under_review', 'approved', 'rejected', 'resubmission_required'], example: 'approved' },
      tutor_feedback: { type: 'string', nullable: true, example: 'Outstanding architecture and complete test coverage!' },
      submitted_at: { type: 'string', format: 'date-time' },
      reviewed_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  Certificate: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 12 },
      certificate_number: { type: 'string', example: 'ATV-2026-CERT-89042' },
      enrollment_id: { type: 'integer', example: 50 },
      user_id: { type: 'integer', example: 1 },
      course_id: { type: 'integer', example: 10 },
      issue_date: { type: 'string', format: 'date', example: '2026-10-01' },
      status: { type: 'string', enum: ['pending', 'approved', 'issued', 'revoked'], example: 'issued' },
      pdf_url: { type: 'string', nullable: true, example: '/api/v1/student/certificates/12/download' },
      student: { $ref: '#/components/schemas/User' },
      course: { $ref: '#/components/schemas/Course' },
      approver: { $ref: '#/components/schemas/User' }
    }
  },

  LiveClass: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 42 },
      course_id: { type: 'integer', example: 10 },
      tutor_id: { type: 'integer', example: 2 },
      title: { type: 'string', example: 'Interactive Q&A & Architecture Deep-Dive' },
      description: { type: 'string', nullable: true, example: 'Bring your questions regarding microservices and state machines.' },
      scheduled_start: { type: 'string', format: 'date-time', example: '2026-10-05T14:00:00.000Z' },
      scheduled_end: { type: 'string', format: 'date-time', example: '2026-10-05T15:30:00.000Z' },
      timezone: { type: 'string', example: 'Asia/Kolkata' },
      zoom_meeting_id: { type: 'string', nullable: true, example: '9876543210' },
      zoom_join_url: { type: 'string', nullable: true, example: 'https://zoom.us/j/9876543210?pwd=xyz' },
      zoom_start_url: { type: 'string', nullable: true, description: 'Only visible to host tutors and admins' },
      status: { type: 'string', enum: ['scheduled', 'live', 'completed', 'cancelled'], example: 'scheduled' },
      can_join: { type: 'boolean', example: false },
      join_opens_at: { type: 'string', format: 'date-time', example: '2026-10-05T13:45:00.000Z' }
    }
  },

  Cart: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 10 },
      user_id: { type: 'integer', example: 1 },
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/CartItem' }
      },
      item_count: { type: 'integer', example: 2 },
      subtotal: { type: 'number', example: 4998.00 },
      discount_amount: { type: 'number', example: 500.00 },
      total_amount: { type: 'number', example: 4498.00 },
      coupon: { $ref: '#/components/schemas/Coupon' }
    }
  },

  CartItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      cart_id: { type: 'integer', example: 10 },
      course_id: { type: 'integer', example: 10 },
      price: { type: 'number', example: 2499.00 },
      course: { $ref: '#/components/schemas/Course' }
    }
  },

  Order: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1001 },
      order_number: { type: 'string', example: 'ATV-ORD-202610-0042' },
      user_id: { type: 'integer', example: 1 },
      total_amount: { type: 'number', example: 4998.00 },
      discount_amount: { type: 'number', example: 500.00 },
      final_amount: { type: 'number', example: 4498.00 },
      currency: { type: 'string', example: 'INR' },
      status: { type: 'string', enum: ['pending', 'paid', 'cancelled', 'failed', 'refunded'], example: 'paid' },
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/OrderItem' }
      },
      payments: {
        type: 'array',
        items: { $ref: '#/components/schemas/Payment' }
      },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  OrderItem: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      order_id: { type: 'integer', example: 1001 },
      course_id: { type: 'integer', example: 10 },
      course_title: { type: 'string', example: 'Complete Full-Stack MERN Architecture' },
      price: { type: 'number', example: 2499.00 },
      discount_amount: { type: 'number', example: 250.00 },
      final_amount: { type: 'number', example: 2249.00 }
    }
  },

  Payment: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 201 },
      order_id: { type: 'integer', example: 1001 },
      user_id: { type: 'integer', example: 1 },
      payment_gateway: { type: 'string', example: 'razorpay' },
      gateway_order_id: { type: 'string', example: 'order_ABC123xyz' },
      gateway_payment_id: { type: 'string', nullable: true, example: 'pay_XYZ789abc' },
      amount: { type: 'number', example: 4498.00 },
      currency: { type: 'string', example: 'INR' },
      status: { type: 'string', enum: ['created', 'pending', 'successful', 'failed', 'refunded'], example: 'successful' },
      payment_method: { type: 'string', nullable: true, example: 'upi' },
      paid_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  Coupon: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 3 },
      code: { type: 'string', example: 'FESTIVE50' },
      discount_type: { type: 'string', enum: ['percentage', 'fixed'], example: 'percentage' },
      discount_value: { type: 'number', example: 50.00 },
      minimum_order_amount: { type: 'number', nullable: true, example: 1000.00 },
      maximum_discount: { type: 'number', nullable: true, example: 1500.00 },
      usage_limit: { type: 'integer', nullable: true, example: 500 },
      times_used: { type: 'integer', example: 142 },
      start_at: { type: 'string', format: 'date-time', nullable: true },
      expires_at: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59.000Z' },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' }
    }
  },

  Review: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 88 },
      course_id: { type: 'integer', example: 10 },
      user_id: { type: 'integer', example: 1 },
      rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
      review: { type: 'string', nullable: true, example: 'One of the best structured courses I have ever taken. Highly recommended!' },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected'], example: 'approved' },
      created_at: { type: 'string', format: 'date-time' },
      user: { $ref: '#/components/schemas/User' },
      course: { $ref: '#/components/schemas/Course' }
    }
  },

  CommunityPost: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 15 },
      user_id: { type: 'integer', example: 1 },
      course_id: { type: 'integer', nullable: true, example: 10, description: 'Null for general community feed, integer for specific course discussion board' },
      content: { type: 'string', example: 'Here is a handy tip for optimizing MySQL indexing on high-concurrency tables.' },
      image_url: { type: 'string', nullable: true, example: 'http://localhost:5000/uploads/images/community/query-plan.png' },
      status: { type: 'string', enum: ['pending', 'published', 'hidden', 'deleted'], example: 'published' },
      like_count: { type: 'integer', example: 24 },
      comment_count: { type: 'integer', example: 6 },
      liked_by_me: { type: 'boolean', example: true },
      can_edit: { type: 'boolean', example: true },
      can_delete: { type: 'boolean', example: true },
      author: { $ref: '#/components/schemas/User' },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  CommunityComment: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 34 },
      post_id: { type: 'integer', example: 15 },
      user_id: { type: 'integer', example: 2 },
      parent_comment_id: { type: 'integer', nullable: true, example: null },
      content: { type: 'string', example: 'Great tip! Have you considered composite indexes for filtering + sorting?' },
      status: { type: 'string', enum: ['visible', 'hidden', 'deleted'], example: 'visible' },
      author: { $ref: '#/components/schemas/User' },
      replies: {
        type: 'array',
        items: { $ref: '#/components/schemas/CommunityComment' }
      },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  Notification: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 450 },
      user_id: { type: 'integer', example: 1 },
      title: { type: 'string', example: 'Quiz Result Available' },
      message: { type: 'string', example: 'You scored 9/10 (90%) in "Module 1 Assessment" - passed.' },
      type: { type: 'string', example: 'quiz_result' },
      reference_type: { type: 'string', nullable: true, example: 'quiz_attempt' },
      reference_id: { type: 'integer', nullable: true, example: 901 },
      is_read: { type: 'boolean', example: false },
      read_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  Communication: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 12 },
      sender_id: { type: 'integer', example: 3 },
      channel: { type: 'string', enum: ['email', 'whatsapp'], example: 'email' },
      recipient_type: { type: 'string', enum: ['student', 'tutor', 'all_students', 'all_tutors', 'all_users'], example: 'all_students' },
      recipient_id: { type: 'integer', nullable: true },
      subject: { type: 'string', nullable: true, example: 'Welcome to the New Term at ATV Academy' },
      message: { type: 'string', example: 'Hi {{first_name}}, we are excited to launch new live masterclasses!' },
      status: { type: 'string', example: 'sent' },
      sent_count: { type: 'integer', example: 1540 },
      failed_count: { type: 'integer', example: 2 },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  CmsPage: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 1 },
      title: { type: 'string', example: 'Terms & Conditions' },
      slug: { type: 'string', example: 'terms-and-conditions' },
      content: { type: 'string', example: '<h2>1. Acceptance of Terms</h2><p>By using ATV Academy...</p>' },
      meta_title: { type: 'string', nullable: true, example: 'Terms of Service | ATV Academy' },
      meta_description: { type: 'string', nullable: true, example: 'Terms and conditions governing course enrollments and access.' },
      status: { type: 'string', enum: ['draft', 'published', 'inactive'], example: 'published' },
      published_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  CmsContent: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 2 },
      section_key: { type: 'string', example: 'hero' },
      title: { type: 'string', example: 'Transform Your Career with Industry-Ready Skills' },
      content: { type: 'string', example: 'Practical courses, live mentor feedback, verified certificates, and a lifetime developer community.' },
      image_url: { type: 'string', nullable: true, example: 'http://localhost:5000/uploads/images/cms/hero.png' },
      data: { type: 'object', nullable: true, example: { cta_text: 'Explore Courses', cta_link: '/courses' } },
      status: { type: 'string', enum: ['active', 'inactive'], example: 'active' }
    }
  },

  Setting: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 5 },
      setting_key: { type: 'string', example: 'site_name' },
      setting_value: { type: 'string', example: 'ATV Academy' },
      setting_group: { type: 'string', enum: ['general', 'payment', 'email', 'whatsapp', 'zoom'], example: 'general' },
      is_public: { type: 'boolean', example: true }
    }
  },

  TutorPayout: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 14 },
      tutor_id: { type: 'integer', example: 2 },
      amount: { type: 'number', example: 35000.00 },
      currency: { type: 'string', example: 'INR' },
      status: { type: 'string', enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'], example: 'paid' },
      payment_method: { type: 'string', nullable: true, example: 'bank_transfer' },
      transaction_reference: { type: 'string', nullable: true, example: 'NEFT98273491823' },
      note: { type: 'string', nullable: true, example: 'September 2026 revenue share payout' },
      paid_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  ReportExport: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 7 },
      report_type: { type: 'string', enum: ['student', 'tutor', 'course', 'sales'], example: 'sales' },
      file_path: { type: 'string', example: 'reports/sales_report_20261001.csv' },
      file_name: { type: 'string', example: 'sales_report_20261001.csv' },
      status: { type: 'string', enum: ['completed', 'failed'], example: 'completed' },
      download_url: { type: 'string', example: '/api/v1/admin/report-exports/7/download' },
      created_at: { type: 'string', format: 'date-time' }
    }
  }
};

export default schemas;
