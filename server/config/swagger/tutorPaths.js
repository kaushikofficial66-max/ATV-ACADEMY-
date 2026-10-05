/**
 * Tutor Panel Endpoints
 */

export const tutorPaths = {
  '/tutor/dashboard': {
    get: {
      tags: ['12. Tutor - Dashboard & Students'],
      summary: 'Tutor Dashboard Analytics & KPIs',
      description: `Returns tutor performance KPIs: assigned course counts, total unique students taught, enrollment completion breakdown, average course ratings, pending project reviews (count + pending_project_approvals list of final projects waiting for approval, oldest first), upcoming live classes, recent enrollments, and earnings balance.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Tutor dashboard payload',
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
                          total_courses: { type: 'integer', example: 5 },
                          published_courses: { type: 'integer', example: 4 },
                          total_students: { type: 'integer', example: 420 },
                          active_enrollments: { type: 'integer', example: 380 },
                          completed_enrollments: { type: 'integer', example: 40 },
                          average_rating: { type: 'number', example: 4.8 },
                          total_reviews: { type: 'integer', example: 95 },
                          pending_project_reviews: { type: 'integer', example: 3 },
                          pending_certificate_approvals: { type: 'integer', example: 2 }
                        }
                      },
                      course_summary: { type: 'object' },
                      student_summary: { type: 'object' },
                      upcoming_live_classes: { type: 'array', items: { $ref: '#/components/schemas/LiveClass' } },
                      earnings_summary: {
                        type: 'object',
                        properties: {
                          share_percent: { type: 'number', example: 70 },
                          total_earnings: { type: 'number', example: 125000.00 },
                          total_paid_out: { type: 'number', example: 95000.00 },
                          balance: { type: 'number', example: 30000.00 },
                          monthly: { type: 'array', items: { type: 'object' } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        403: { description: 'Requires active approved tutor role' }
      }
    }
  },

  '/tutor/courses': {
    get: {
      tags: ['12. Tutor - Dashboard & Students'],
      summary: 'List Courses Assigned to Tutor',
      description: 'Paginated list of courses created by or assigned to the authenticated tutor.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'pending', 'approved', 'published', 'rejected', 'archived'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Assigned courses list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } }
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

  '/tutor/students': {
    get: {
      tags: ['12. Tutor - Dashboard & Students'],
      summary: 'List Students Enrolled in Tutor Courses',
      description: 'Paginated list of enrollments across the tutor assigned courses.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'course_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by specific assigned course' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'completed', 'expired'] } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search student name or email' },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Students enrollments list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      students: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            student: { $ref: '#/components/schemas/User' },
                            course: { $ref: '#/components/schemas/Course' },
                            completion_percentage: { type: 'number' },
                            status: { type: 'string' }
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

  '/tutor/students/{studentId}': {
    get: {
      tags: ['12. Tutor - Dashboard & Students'],
      summary: 'Get Student Deep-Dive Across Tutor Courses',
      description: 'Returns student profile, course enrollments, quiz attempt scores, project submissions, and live class attendance records.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Student comprehensive progress record' },
        403: { description: 'Student is not enrolled in any of your courses' },
        404: { description: 'Student not found' }
      }
    }
  },

  '/tutor/enrollments/{enrollmentId}/progress': {
    get: {
      tags: ['12. Tutor - Dashboard & Students'],
      summary: 'Inspect Lecture-by-Lecture Student Progress',
      description: 'Returns granular section and lecture breakdown showing watched seconds, completion flags, and completion timestamps for a student enrollment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'enrollmentId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Lecture progress breakdown' },
        403: { description: 'Not authorized for this course' },
        404: { description: 'Enrollment not found' }
      }
    }
  },

  '/tutor/reviews': {
    get: {
      tags: ['13. Tutor - Reviews & Earnings'],
      summary: 'List Reviews for Tutor Courses',
      description: 'Returns approved student reviews and star rating breakdown across the tutor assigned courses.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'course_id', in: 'query', schema: { type: 'integer' } },
        { name: 'rating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Reviews and rating summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      summary: {
                        type: 'object',
                        properties: {
                          total_reviews: { type: 'integer', example: 120 },
                          average_rating: { type: 'number', example: 4.8 },
                          breakdown: { type: 'array', items: { type: 'object' } }
                        }
                      },
                      reviews: { type: 'array', items: { $ref: '#/components/schemas/Review' } }
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

  '/tutor/earnings': {
    get: {
      tags: ['13. Tutor - Reviews & Earnings'],
      summary: 'Get Detailed Earnings & Revenue Share Breakdown',
      description: `Calculates tutor earnings based on paid order revenue multiplied by tutor_revenue_share_percent (default 70%), distributed equally between co-tutors. Returns total earnings, paid out sums, current balance, course-wise earnings, and monthly trend.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }
      ],
      responses: {
        200: {
          description: 'Earnings analytics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      share_percent: { type: 'number', example: 70 },
                      total_earnings: { type: 'number', example: 125000.00 },
                      total_paid_out: { type: 'number', example: 95000.00 },
                      balance: { type: 'number', example: 30000.00 },
                      courses: { type: 'array', items: { type: 'object' } },
                      monthly: { type: 'array', items: { type: 'object' } }
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

  '/tutor/payouts': {
    get: {
      tags: ['13. Tutor - Reviews & Earnings'],
      summary: 'List Payout History',
      description: 'Historical records of revenue payouts transferred to the tutor by administration.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'] } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Payouts list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      payouts: { type: 'array', items: { $ref: '#/components/schemas/TutorPayout' } }
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
  }
};

export default tutorPaths;
