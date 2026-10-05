/**
 * Student Panel Endpoints
 */

export const studentPaths = {
  // ==========================================
  // Dashboard & Learning
  // ==========================================
  '/student/dashboard': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Student Dashboard Overview',
      description: 'Returns student metrics (enrolled, completed, average progress), recent courses, upcoming live classes, and notifications.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Dashboard metrics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      overview: {
                        type: 'object',
                        properties: {
                          enrolled_courses: { type: 'integer', example: 4 },
                          in_progress: { type: 'integer', example: 3 },
                          completed_courses: { type: 'integer', example: 1 },
                          average_progress: { type: 'number', example: 68.5 },
                          certificates_issued: { type: 'integer', example: 1 },
                          quizzes_passed: { type: 'integer', example: 7 },
                          community_access: { type: 'boolean', example: true }
                        }
                      },
                      recent_courses: { type: 'array', items: { type: 'object' } },
                      upcoming_live_classes: { type: 'array', items: { $ref: '#/components/schemas/LiveClass' } }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'Requires student role privileges' }
      }
    }
  },

  '/student/courses': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'List Enrolled Courses ("My Courses")',
      description: 'Paginated list of courses purchased by the student with progress and certificate status.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'completed', 'in_progress', 'not_started'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Enrolled courses list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      enrollments: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 50 },
                            course_id: { type: 'integer', example: 10 },
                            status: { type: 'string', example: 'active' },
                            completion_percentage: { type: 'number', example: 65.0 },
                            course: { $ref: '#/components/schemas/Course' },
                            certificate: { $ref: '#/components/schemas/Certificate' }
                          }
                        }
                      }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/continue-learning': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Get Next Resume Lecture for Recent Courses',
      description: 'Returns active courses with the exact next unfinished lecture in curriculum order to resume playback immediately.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 5 } }
      ],
      responses: {
        200: {
          description: 'Resume learning courses',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      courses: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            enrollment_id: { type: 'integer' },
                            course: { $ref: '#/components/schemas/Course' },
                            completion_percentage: { type: 'number' },
                            resume_lecture: { $ref: '#/components/schemas/Lecture' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/courses/{courseId}/learn': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Course Player Full Curriculum & Progress Tree',
      description: `Primary endpoint for the course player UI. Returns complete curriculum hierarchy with per-lecture completion marks, watched seconds, attached quizzes, final project status & eligibility, certificate status, and resume position. Staff can preview un-enrolled courses.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Course player curriculum payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      course: { $ref: '#/components/schemas/Course' },
                      curriculum: { type: 'array', items: { $ref: '#/components/schemas/CourseSection' } },
                      progress: { type: 'object' },
                      completion_threshold: { type: 'number', example: 90 },
                      quizzes: { type: 'array', items: { type: 'object' } },
                      project: { type: 'object', nullable: true },
                      certificate: { $ref: '#/components/schemas/Certificate' },
                      resume_lecture: { $ref: '#/components/schemas/Lecture' }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'Course not enrolled' },
        404: { description: 'Course not found' }
      }
    }
  },

  '/student/courses/{courseId}/progress': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Recalculated Course Progress Snapshot',
      description: 'Force recalculates and returns the latest completion statistics for an enrolled course.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Progress recomputed' },
        403: { description: 'Not enrolled' }
      }
    }
  },

  '/student/courses/{courseId}/resources': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'List All Course Resources',
      description: 'Returns all active downloadable resource attachments for an enrolled course.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Resources list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      resources: { type: 'array', items: { $ref: '#/components/schemas/CourseResource' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/lectures/{lectureId}': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Get Lecture Player Content & Video Playback (Vimeo embed)',
      description: `Retrieves lecture content, quizzes, resources, previous/next navigation links, and a signed, time-limited video stream URL (\`/media/videos/:id/stream?token=\`). Accessible if enrolled or if the lecture is flagged \`is_preview = true\`.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Lecture detail with streaming token',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      lecture: { $ref: '#/components/schemas/Lecture' },
                      video: { $ref: '#/components/schemas/RecordedVideo' },
                      resources: { type: 'array', items: { $ref: '#/components/schemas/CourseResource' } },
                      quizzes: { type: 'array', items: { $ref: '#/components/schemas/Quiz' } },
                      navigation: {
                        type: 'object',
                        properties: {
                          previous: { type: 'object', nullable: true },
                          next: { type: 'object', nullable: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'Access restricted: not enrolled in this course' },
        404: { description: 'Lecture not found' }
      }
    }
  },

  '/student/lectures/{lectureId}/progress': {
    post: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Update Lecture Playback Progress',
      description: `Heartbeat sent periodically (~15s) from the player to save the resume position and tick the lecture as watched (at 90% of its duration).
This does **not** change course %: course progress grows only through POST /student/lectures/{lectureId}/play (or /student/videos/{videoId}/play) and live-class joins (90% completion rule).`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                watched_seconds: { type: 'number', minimum: 0, example: 350 },
                position_seconds: { type: 'number', minimum: 0, example: 350 },
                completed: { type: 'boolean', example: false }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Progress saved successfully' },
        403: { description: 'Progress only tracked for enrolled students' }
      }
    }
  },

  '/student/lectures/{lectureId}/play': {
    post: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Record Video Play (adds course progress)',
      description: `**90% completion rule - phase 1.** Call when the student presses play on the lecture's recorded video.
Each counted play adds the fixed increment (\`progress_increment_percent\`, default 10%) to the course progress, up to **90%** - never higher.
Repeated plays of the same video within \`progress_activity_cooldown_minutes\` (default 10) count once (\`reason: already_counted_recently\`).
At 90% the final project unlocks (\`progress.status = project_unlocked\`).`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'Play recorded; progress returned',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Progress +10%.' },
                  data: { $ref: '#/components/schemas/ProgressActivityResult' }
                }
              }
            }
          }
        },
        403: { description: 'Not enrolled in the course' },
        404: { description: 'No playable recorded video' }
      }
    }
  },

  '/student/videos/{videoId}/play': {
    post: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Record Video Play by Video Id (adds course progress)',
      description: 'Same as POST /student/lectures/{lectureId}/play, using the recorded video id (e.g. from the video library).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'Play recorded; progress returned',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Progress +10%.' },
                  data: { $ref: '#/components/schemas/ProgressActivityResult' }
                }
              }
            }
          }
        },
        403: { description: 'Not enrolled in the course' },
        404: { description: 'No playable recorded video' }
      }
    }
  },

  '/student/lectures/{lectureId}/complete': {
    post: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Mark Non-Video Lecture as Completed',
      description: 'Used for text, document, or non-video lectures to mark them finished manually.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Lecture marked complete' }
      }
    }
  },

  '/student/resources/{resourceId}/download': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Securely Download Course Resource File',
      description: 'Verifies course enrollment and streams the requested resource document as an attachment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'resourceId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Binary file download stream' },
        403: { description: 'Enrollment required' },
        404: { description: 'Resource not found' }
      }
    }
  },

  '/student/videos/{videoId}': {
    get: {
      tags: ['5. Student - Dashboard & Learning'],
      summary: 'Get Playable Video Detail',
      description: 'Returns video playback detail and existing playback position for enrolled students.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Video playback metadata' },
        404: { description: 'Video not found' }
      }
    }
  },

  // ==========================================
  // Quizzes & Assessments
  // ==========================================
  '/student/courses/{courseId}/quizzes': {
    get: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'List Course Quizzes with Student Attempts',
      description: 'Returns all published quizzes in a course with attempt counters and pass/fail indicators.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Quizzes list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      quizzes: { type: 'array', items: { $ref: '#/components/schemas/Quiz' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/quiz-results': {
    get: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'List All Quiz Results Across Courses',
      description: 'Historical list of all completed quiz attempts and scores for the current student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Quiz results list' }
      }
    }
  },

  '/student/quizzes/{quizId}': {
    get: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'Get Quiz Overview & Attempt Status',
      description: 'Returns quiz instructions, time limits, total marks, and remaining allowed attempts (without exposing questions before start).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Quiz summary and attempt availability' },
        404: { description: 'Quiz not found' }
      }
    }
  },

  '/student/quizzes/{quizId}/attempts': {
    get: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'List My Attempts for Quiz',
      description: 'Returns attempt history, status, scores, and dates for a specific quiz.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Attempts history' }
      }
    }
  },

  '/student/quizzes/{quizId}/start': {
    post: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'Start (or Resume) a Quiz Attempt',
      description: 'Creates a new attempt, locks questions, computes deadline if timed, and returns question options (without correct answer flags).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        201: {
          description: 'Attempt started with questions payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      attempt: { $ref: '#/components/schemas/QuizAttempt' },
                      remaining_seconds: { type: 'integer', nullable: true },
                      questions: { type: 'array', items: { $ref: '#/components/schemas/QuizQuestion' } }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'All allowed attempts have been used' }
      }
    }
  },

  '/student/quizzes/{quizId}/submit': {
    post: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'Direct Submit for Untimed Quizzes',
      description: 'Starts and grades an attempt in a single HTTP request for untimed quizzes.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['answers'],
              properties: {
                answers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['question_id'],
                    properties: {
                      question_id: { type: 'integer' },
                      answer_id: { type: 'integer', description: 'For single/true_false' },
                      answer_ids: { type: 'array', items: { type: 'integer' }, description: 'For multiple choice' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Graded quiz score and pass status' }
      }
    }
  },

  '/student/quiz-attempts/{attemptId}/submit': {
    post: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'Submit Answers for Started Quiz Attempt',
      description: 'Grades student answers, checks time limit compliance, records score and marks passed boolean.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'attemptId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['answers'],
              properties: {
                answers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['question_id'],
                    properties: {
                      question_id: { type: 'integer' },
                      answer_id: { type: 'integer' },
                      answer_ids: { type: 'array', items: { type: 'integer' } }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Attempt submitted and graded' },
        409: { description: 'Attempt has already been submitted' }
      }
    }
  },

  '/student/quiz-attempts/{attemptId}': {
    get: {
      tags: ['6. Student - Quizzes & Assessments'],
      summary: 'Get Attempt Result with Answer Breakdown',
      description: 'Returns score, percentage, correct answer keys, and student chosen options after submission.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'attemptId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Result with review breakdown' },
        400: { description: 'Attempt is still in progress' }
      }
    }
  },

  // ==========================================
  // Final Projects
  // ==========================================
  '/student/courses/{courseId}/project': {
    get: {
      tags: ['7. Student - Final Projects'],
      summary: 'Get Course Project Guidelines & Eligibility',
      description: `Returns project instructions, allowed file types, max file size, submission history and the course progress. The project unlocks when course progress reaches 90% (video plays / live-class joins).`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Project guidelines & eligibility status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      project: { $ref: '#/components/schemas/Project' },
                      eligibility: {
                        type: 'object',
                        properties: {
                          threshold: { type: 'number', example: 90 },
                          lecture_completion_percentage: { type: 'number', example: 92.5 },
                          is_eligible: { type: 'boolean', example: true }
                        }
                      },
                      can_submit: { type: 'boolean', example: true },
                      submission_status: { type: 'string', example: 'submitted' },
                      latest_submission: { $ref: '#/components/schemas/ProjectSubmission' }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Course does not have an active final project' }
      }
    }
  },

  '/student/projects/{projectId}/submit': {
    post: {
      tags: ['7. Student - Final Projects'],
      summary: 'Upload Final Capstone Project Submission',
      description: `**90% completion rule - phase 2.** Multipart upload of the final project, allowed once course progress is 90%.
The course then shows **Pending Approval** (progress stays 90%) and the submission appears on the tutor and admin dashboards.
If the tutor rejects it, the student is notified and can upload a new version (progress stays 90%). Approval takes the course to 100% and issues the certificate.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['project_file'],
              properties: {
                project_file: { type: 'string', format: 'binary' },
                submission_note: { type: 'string', example: 'Live URL: https://mysaas.com. Documentation inside ZIP.' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Project submitted successfully' },
        403: { description: 'Not eligible yet: course progress is below 90%' },
        409: { description: 'A submission is already pending approval, or the project is already approved' },
        409: { description: 'Previous submission still awaiting review or already approved' },
        413: { description: 'File exceeds maximum allowed size' },
        415: { description: 'Disallowed file extension' }
      }
    }
  },

  '/student/project-submissions': {
    get: {
      tags: ['7. Student - Final Projects'],
      summary: 'List All My Project Submissions',
      description: 'Historical submissions across courses with review status and tutor feedback.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Submissions list' }
      }
    }
  },

  '/student/project-submissions/{submissionId}/download': {
    get: {
      tags: ['7. Student - Final Projects'],
      summary: 'Download Submitted Project File',
      description: 'Allows student to download their own previously submitted project archive.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'submissionId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'File download stream' }
      }
    }
  },

  '/student/project-submissions/{submissionId}': {
    delete: {
      tags: ['7. Student - Final Projects'],
      summary: 'Withdraw Pending Project Submission',
      description: 'Deletes submission file if tutor has not yet started reviewing it.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'submissionId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Submission withdrawn' },
        404: { description: 'Submission not found or already under review' }
      }
    }
  },

  // ==========================================
  // Live Classes
  // ==========================================
  '/student/live-classes': {
    get: {
      tags: ['8. Student - Live Classes'],
      summary: 'List Live Classes for Enrolled Courses',
      description: 'Filterable by scope (upcoming, past, all) and course_id. Computes join window availability.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'scope', in: 'query', schema: { type: 'string', enum: ['upcoming', 'past', 'all'], default: 'upcoming' } },
        { name: 'course_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Live classes list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      live_classes: { type: 'array', items: { $ref: '#/components/schemas/LiveClass' } }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/live-classes/{classId}': {
    get: {
      tags: ['8. Student - Live Classes'],
      summary: 'Get Live Class Details',
      description: 'Class details, agenda, and join window timing for enrolled student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Live class details' }
      }
    }
  },

  '/student/live-classes/{classId}/join': {
    post: {
      tags: ['8. Student - Live Classes'],
      summary: 'Join Zoom Live Class',
      description: `Returns Zoom join URL (to open in a new tab) and logs attendance. Only accessible during the join window (15 minutes prior to start until scheduled end or live status).
**90% completion rule:** each counted join adds the progress increment (up to 90%); rejoining the same class within the cooldown counts once.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Zoom URL and meeting password',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      join_url: { type: 'string', example: 'https://zoom.us/j/9876543210?pwd=xyz' },
                      meeting_id: { type: 'string', example: '9876543210' },
                      password: { type: 'string', example: '123456' },
                      open_in_new_tab: { type: 'boolean', example: true },
                      progress_counted: { type: 'boolean', example: true },
                      increment_applied: { type: 'number', example: 10 },
                      progress: { $ref: '#/components/schemas/CourseProgressSummary' }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'Join window is closed or not enrolled in course' }
      }
    }
  },

  '/student/live-classes/{classId}/leave': {
    post: {
      tags: ['8. Student - Live Classes'],
      summary: 'Record Live Class Departure',
      description: 'Records timestamp when student leaves the session.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Departure recorded' }
      }
    }
  },

  // ==========================================
  // Certificates
  // ==========================================
  '/student/certificates': {
    get: {
      tags: ['9. Student - Certificates'],
      summary: 'List Earned Certificates',
      description: 'Returns all course completion certificates issued to the student with PDF download links.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Certificates list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      certificates: { type: 'array', items: { $ref: '#/components/schemas/Certificate' } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/courses/{courseId}/certificate': {
    get: {
      tags: ['9. Student - Certificates'],
      summary: 'Check Course Certificate Status',
      description: 'Returns the certificate state: `issued` (download available - granted when the final project is approved), `revoked`, or `not_eligible` while the course is not completed.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Certificate eligibility state' }
      }
    }
  },

  '/student/certificates/{certificateId}/download': {
    get: {
      tags: ['9. Student - Certificates'],
      summary: 'Download Official Certificate PDF',
      description: 'Streams the dynamically rendered vector PDF certificate with verified seal and certificate number.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'certificateId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'PDF stream (application/pdf)' },
        403: { description: 'Certificate still pending approval or revoked' },
        404: { description: 'Certificate not found' }
      }
    }
  },

  // ==========================================
  // Wishlist, Cart & Orders
  // ==========================================
  '/student/wishlist': {
    get: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Get Student Wishlist',
      description: 'Returns all courses saved in wishlist with current pricing and discounts.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Wishlist items' }
      }
    },
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Add Course to Wishlist',
      description: 'Adds a published course to wishlist if not already enrolled.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['course_id'],
              properties: {
                course_id: { type: 'integer', example: 10 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Already in wishlist' },
        201: { description: 'Added to wishlist' },
        409: { description: 'Already enrolled in course' }
      }
    }
  },

  '/student/wishlist/{courseId}': {
    delete: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Remove Course from Wishlist',
      description: 'Removes course from wishlist.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Removed from wishlist' }
      }
    }
  },

  '/student/wishlist/{courseId}/move-to-cart': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Move Item from Wishlist to Cart',
      description: 'Atomically adds item to active cart and removes it from wishlist.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Moved to cart' }
      }
    }
  },

  '/student/cart': {
    get: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Get Active Cart Contents & Pricing',
      description: 'Returns cart items, subtotal, optional coupon discount, and final amount.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'coupon_code', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Cart summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      cart: { $ref: '#/components/schemas/Cart' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Add Course to Cart',
      description: 'Adds course to active cart with effective price.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['course_id'],
              properties: {
                course_id: { type: 'integer', example: 10 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Course already in cart' },
        201: { description: 'Course added to cart' },
        409: { description: 'Already enrolled in course' }
      }
    },
    delete: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Empty Entire Cart',
      description: 'Removes all items from the active cart.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Cart cleared' }
      }
    }
  },

  '/student/cart/{courseId}': {
    delete: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Remove Single Item from Cart',
      description: 'Removes course from active cart.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Item removed from cart' }
      }
    }
  },

  '/student/cart/{courseId}/move-to-wishlist': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Move Item from Cart to Wishlist',
      description: 'Removes course from active cart and saves it to wishlist.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Moved to wishlist' }
      }
    }
  },

  '/student/cart/apply-coupon': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Validate and Apply Coupon Code',
      description: 'Calculates discount on current cart or specified buy-now course IDs.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: 'FESTIVE50' },
                course_ids: { type: 'array', items: { type: 'integer' }, description: 'Optional list of courses for Buy Now' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Coupon applied successfully' },
        400: { description: 'Invalid, expired, or min order limit not met' }
      }
    }
  },

  '/student/checkout': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Checkout & Initiate Payment Order',
      description: `Creates an Order and OrderItems from active cart (or course_ids). If total amount is 0 (free or 100% coupon), fulfills enrollment immediately. If paid, creates a Razorpay gateway order and returns keys/order_id for frontend Razorpay SDK.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                coupon_code: { type: 'string', example: 'FESTIVE50' },
                course_ids: { type: 'array', items: { type: 'integer' }, description: 'Optional direct buy-now course IDs' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Checkout order created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      order_id: { type: 'integer', example: 1001 },
                      order_number: { type: 'string', example: 'ATV-ORD-202610-0042' },
                      is_free: { type: 'boolean', example: false },
                      gateway: {
                        type: 'object',
                        properties: {
                          key_id: { type: 'string', example: 'rzp_test_12345678' },
                          razorpay_order_id: { type: 'string', example: 'order_ABC123xyz' },
                          amount: { type: 'integer', example: 249900, description: 'Amount in paise' },
                          currency: { type: 'string', example: 'INR' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/payments/verify': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Verify Razorpay Payment Signature & Fulfill Enrollment',
      description: 'Cryptographically verifies the Razorpay signature on server. Upon success, marks order paid, fulfills enrollments, and grants community access.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
              properties: {
                razorpay_order_id: { type: 'string', example: 'order_ABC123xyz' },
                razorpay_payment_id: { type: 'string', example: 'pay_XYZ789abc' },
                razorpay_signature: { type: 'string', example: '9ef8a42c38f...' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Payment verified and courses enrolled' },
        400: { description: 'Signature verification failed' }
      }
    }
  },

  '/student/payments/failed': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Report Client-Side Payment Failure',
      description: 'Records failed payment attempt so student can retry without re-adding courses to cart.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['razorpay_order_id'],
              properties: {
                razorpay_order_id: { type: 'string' },
                error: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Failure recorded' }
      }
    }
  },

  '/student/orders': {
    get: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Get Order History',
      description: 'Paginated list of orders placed by the student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'paid', 'cancelled', 'failed', 'refunded'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Orders history list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/student/orders/{orderId}': {
    get: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Get Order Details & Invoice',
      description: 'Full order invoice details including line items, discounts, and payment transactions.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Order details' },
        404: { description: 'Order not found' }
      }
    }
  },

  '/student/orders/{orderId}/retry-payment': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Retry Payment for Pending Order',
      description: 'Generates a new Razorpay order for an unpaid or previously failed order.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'New gateway payment order initiated' }
      }
    }
  },

  '/student/orders/{orderId}/cancel': {
    post: {
      tags: ['10. Student - Wishlist, Cart & Orders'],
      summary: 'Cancel Unpaid Order',
      description: 'Marks an unpaid pending order as cancelled.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Order cancelled' }
      }
    }
  },

  // ==========================================
  // Reviews
  // ==========================================
  '/student/reviews': {
    get: {
      tags: ['11. Student - Reviews'],
      summary: 'List All Reviews Submitted by Student',
      description: 'Returns review history across all courses.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Student reviews list' }
      }
    }
  },

  '/student/courses/{courseId}/review': {
    get: {
      tags: ['11. Student - Reviews'],
      summary: 'Get My Review for Course',
      description: 'Returns review submitted by student for a course, if any.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Course review' }
      }
    },
    post: {
      tags: ['11. Student - Reviews'],
      summary: 'Submit Course Review',
      description: 'Creates or updates review for enrolled course. Subject to admin moderation unless auto-approval is enabled.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                review: { type: 'string', example: 'Comprehensive and practical course!' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Review submitted' },
        403: { description: 'Must be enrolled in course to submit review' }
      }
    },
    put: {
      tags: ['11. Student - Reviews'],
      summary: 'Update Course Review',
      description: 'Updates review rating or text. Sent back to moderation queue.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5 },
                review: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Review updated' }
      }
    },
    delete: {
      tags: ['11. Student - Reviews'],
      summary: 'Delete Course Review',
      description: 'Deletes review written by student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Review deleted' },
        404: { description: 'Review not found' }
      }
    }
  }
};

export default studentPaths;
