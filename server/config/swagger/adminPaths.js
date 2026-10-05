/**
 * Admin Panel Specific Endpoints (Excluding Shared Course Builder)
 */

export const adminPaths = {
  // ==========================================
  // Dashboard & Analytics
  // ==========================================
  '/admin/dashboard': {
    get: {
      tags: ['19. Admin - Dashboard & Analytics'],
      summary: 'Executive Admin Dashboard KPIs',
      description: 'System-wide analytics: total revenue, active students, tutors, courses, orders, and recent activity streams.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Admin executive metrics' }
      }
    }
  },

  // ==========================================
  // Users Management
  // ==========================================
  '/admin/users': {
    post: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Create New User Account (Student, Tutor, or Admin)',
      description: 'Creates a user account, sends an invitation or welcome email, and sets role privileges.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['first_name', 'email', 'role'],
              properties: {
                first_name: { type: 'string', example: 'Rohan' },
                last_name: { type: 'string', example: 'Mehta' },
                email: { type: 'string', format: 'email', example: 'rohan.mehta@example.com' },
                role: { type: 'string', enum: ['student', 'tutor', 'admin'], example: 'tutor' },
                password: { type: 'string', example: 'Welcome@123' },
                status: { type: 'string', enum: ['active', 'inactive', 'blocked', 'pending'], default: 'active' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'User created successfully' },
        409: { description: 'Email already exists' }
      }
    }
  },

  '/admin/users/{userId}': {
    put: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Update User Details',
      description: 'Updates basic profile, names, phone number, and status for any user.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                phone: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'User updated' }
      }
    }
  },

  '/admin/users/{userId}/status': {
    patch: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Update User Account Status',
      description: 'Changes user status to active, inactive, blocked, or pending.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['active', 'inactive', 'blocked', 'pending'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Status updated' }
      }
    }
  },

  '/admin/users/{userId}/send-password-reset': {
    post: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Trigger Password Reset Email for User',
      description: 'Dispatches password reset instructions directly to the user email address.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Password reset link sent' }
      }
    }
  },

  // Students
  '/admin/students': {
    get: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'List All Students with Metrics',
      description: 'Paginated list with enrollment counts, completed counts, and lifetime spend.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'blocked'] } },
        { name: 'verified', in: 'query', schema: { type: 'boolean' } },
        { name: 'course_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Students list' }
      }
    }
  },

  '/admin/students/{studentId}': {
    get: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Get Student Detailed Profile',
      description: 'Returns profile details, enrollments, certificates, and order history.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Student profile details' }
      }
    }
  },

  '/admin/students/{studentId}/status': {
    patch: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Change Student Status',
      description: 'Block, activate, or deactivate a student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['active', 'inactive', 'blocked'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Student status updated' }
      }
    }
  },

  '/admin/students/{studentId}/enrollments': {
    post: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Manually Enroll Student into Course',
      description: 'Grants immediate student access to a course without payment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } }],
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
        201: { description: 'Student enrolled successfully' }
      }
    }
  },

  // Tutors
  '/admin/tutors': {
    get: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'List All Tutors with Metrics',
      description: 'Lists all tutors, filterable by approval status (e.g. pending applications).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'active', 'inactive', 'blocked'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Tutors list' }
      }
    }
  },

  '/admin/tutors/{tutorId}': {
    get: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Get Tutor Full Dossier',
      description: 'Returns tutor profile, assigned courses, student counts, and payout metrics.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'tutorId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Tutor details' }
      }
    }
  },

  '/admin/tutors/{tutorId}/approval': {
    patch: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Approve or Reject Tutor Application',
      description: 'Approves (activates) or rejects a self-registered pending tutor application.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'tutorId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['action'],
              properties: {
                action: { type: 'string', enum: ['approve', 'reject'] },
                reason: { type: 'string', example: 'Profile meets instructor standards.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Tutor application reviewed' }
      }
    }
  },

  '/admin/tutors/{tutorId}/status': {
    patch: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Change Tutor Status',
      description: 'Activates, deactivates, or blocks tutor account.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'tutorId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['active', 'inactive', 'blocked', 'pending'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Status updated' }
      }
    }
  },

  '/admin/tutors/{tutorId}/earnings': {
    get: {
      tags: ['20. Admin - Users, Students & Tutors'],
      summary: 'Inspect Specific Tutor Earnings',
      description: 'Returns revenue breakdown, balances, and payouts history for a tutor.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'tutorId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Tutor earnings details' }
      }
    }
  },

  // Courses & Categories
  '/admin/courses': {
    get: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'List All Courses Across Platform',
      description: 'Full course catalog view across all draft, pending, approved, and published courses.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string' } },
        { name: 'category_id', in: 'query', schema: { type: 'integer' } },
        { name: 'tutor_id', in: 'query', schema: { type: 'integer' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Courses list' }
      }
    }
  },

  '/admin/course-options': {
    get: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'List Compact Course Options',
      description: 'Returns lightweight ID and title objects for select dropdowns.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Course options list' }
      }
    }
  },

  '/admin/courses/{courseId}/approval': {
    patch: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'Review Course Submission (Approve, Publish, Reject)',
      description: `Decides on a pending course submission.
- approve: marks approved (tutor can publish when ready)
- publish: marks approved and immediately sets status to published
- reject: returns status to rejected with an approval_note explaining required fixes`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['action'],
              properties: {
                action: { type: 'string', enum: ['approve', 'publish', 'reject'] },
                approval_note: { type: 'string', example: 'Curriculum meets quality standards.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Course approval updated and tutor notified' }
      }
    }
  },

  '/admin/courses/{courseId}/tutors': {
    put: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'Assign Tutors to Course',
      description: 'Replaces assigned tutors and designates primary instructor.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tutors'],
              properties: {
                tutors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['tutor_id'],
                    properties: {
                      tutor_id: { type: 'integer' },
                      is_primary: { type: 'boolean', default: false }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Tutor assignments updated' }
      }
    }
  },

  '/admin/categories': {
    get: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'List Categories for Admin',
      description: 'Lists all categories including inactive ones with course counts.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Categories list' }
      }
    },
    post: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'Create Category',
      description: 'Creates a category with name, description, and optional icon image.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Cloud Computing' },
                description: { type: 'string', example: 'AWS, Azure, GCP, and Kubernetes.' },
                status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                image: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Category created' }
      }
    }
  },

  '/admin/categories/{categoryId}`': {
    put: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'Update Category',
      description: 'Updates category title, slug, description, image, or status.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'categoryId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                status: { type: 'string', enum: ['active', 'inactive'] },
                image: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Category updated' }
      }
    },
    delete: {
      tags: ['21. Admin - Courses & Categories'],
      summary: 'Delete Category',
      description: 'Deletes category. Optionally reassigns courses to another category ID via ?reassign_to=.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'categoryId', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'reassign_to', in: 'query', schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Category deleted' }
      }
    }
  },

  // Enrollments
  '/admin/enrollments': {
    get: {
      tags: ['22. Admin - Enrollments & Progress'],
      summary: 'List Enrollments Across Platform',
      description: 'Paginated enrollments with filters for status, course_id, min_progress, and dates.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'completed', 'cancelled', 'expired'] } },
        { name: 'course_id', in: 'query', schema: { type: 'integer' } },
        { name: 'min_progress', in: 'query', schema: { type: 'number' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Enrollments list' }
      }
    }
  },

  '/admin/enrollments/{enrollmentId}': {
    get: {
      tags: ['22. Admin - Enrollments & Progress'],
      summary: 'Get Enrollment Detail',
      description: 'Full enrollment record, student profile, course progress, and certificate status.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'enrollmentId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Enrollment details' }
      }
    },
    patch: {
      tags: ['22. Admin - Enrollments & Progress'],
      summary: 'Update Enrollment Status or Expiry',
      description: 'Manually adjust status or extend course access expiration date.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'enrollmentId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['active', 'completed', 'cancelled', 'expired'] },
                expires_at: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Enrollment updated' }
      }
    }
  },

  '/admin/enrollments/{enrollmentId}/recalculate': {
    post: {
      tags: ['22. Admin - Enrollments & Progress'],
      summary: 'Recalculate Enrollment Progress',
      description: 'Recomputes lecture watch percentages and marks completion if 100%.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'enrollmentId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Progress recalculated' }
      }
    }
  },

  // Orders, Payments & Coupons
  '/admin/orders': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'List All Orders Across Platform',
      description: 'Paginated orders with revenue status totals, filters for coupon_id, course_id, and dates.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'paid', 'cancelled', 'failed', 'refunded'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Orders list with totals' }
      }
    }
  },

  '/admin/orders/{orderId}': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Get Order Invoice & Payment Attempts',
      description: 'Order details, purchased courses, buyer info, and all gateway payment transaction records.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Order details' }
      }
    }
  },

  '/admin/orders/{orderId}/status': {
    patch: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Manually Mark Order Status (e.g. Paid Offline)',
      description: 'Marks an order as paid (which automatically triggers fulfillment and course enrollments).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['paid', 'cancelled', 'failed', 'pending'] },
                payment_method: { type: 'string', example: 'bank_transfer' },
                transaction_reference: { type: 'string', example: 'NEFT123891823' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Order status updated' }
      }
    }
  },

  '/admin/orders/{orderId}/refund': {
    post: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Process Order Refund',
      description: 'Refunds payment via Razorpay API or marks offline refund and revokes course enrollments.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: { type: 'number', description: 'Partial refund amount or null for full' },
                reason: { type: 'string', example: 'Customer requested refund within 7 days.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Order refunded' }
      }
    }
  },

  '/admin/payments': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'List All Payment Transactions',
      description: 'Transaction log of gateway and offline payments.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Payments list' }
      }
    }
  },

  '/admin/payments/{paymentId}': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Get Payment Attempt Detail',
      description: 'Raw gateway payment payload, method, and transaction signatures.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Payment record' }
      }
    }
  },

  '/admin/coupons': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'List Coupons',
      description: 'Lists all promotional discount coupons with redemption counters.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Coupons list' }
      }
    },
    post: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Create Discount Coupon',
      description: 'Creates a percentage or fixed amount discount coupon.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'discount_type', 'discount_value', 'expires_at'],
              properties: {
                code: { type: 'string', example: 'DIWALI50' },
                discount_type: { type: 'string', enum: ['percentage', 'fixed'] },
                discount_value: { type: 'number', example: 50.00 },
                minimum_order_amount: { type: 'number', example: 1000.00 },
                maximum_discount: { type: 'number', example: 2000.00 },
                usage_limit: { type: 'integer', example: 500 },
                expires_at: { type: 'string', format: 'date-time', example: '2026-11-30T23:59:59.000Z' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Coupon created' }
      }
    }
  },

  '/admin/coupons/{couponId}': {
    get: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Get Coupon Detail & Usage Logs',
      description: 'Returns coupon rules and list of orders where it was applied.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'couponId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Coupon detail' }
      }
    },
    put: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Update Coupon',
      description: 'Updates coupon value, limits, and expiration date.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'couponId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                discount_value: { type: 'number' },
                expires_at: { type: 'string', format: 'date-time' },
                usage_limit: { type: 'integer' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Coupon updated' }
      }
    },
    delete: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Delete Coupon',
      description: 'Deletes coupon record if not used, or marks inactive.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'couponId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Coupon deleted' }
      }
    }
  },

  '/admin/coupons/{couponId}/status': {
    patch: {
      tags: ['23. Admin - Orders, Payments & Coupons'],
      summary: 'Toggle Coupon Active/Inactive',
      description: 'Activates or deactivates coupon immediately.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'couponId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['active', 'inactive'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Coupon status updated' }
      }
    }
  },

  // Tutor Payouts
  '/admin/payouts': {
    get: {
      tags: ['24. Admin - Tutor Payouts'],
      summary: 'List Tutor Payouts Across Platform',
      description: 'Returns all recorded payouts to tutors.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Payouts list' }
      }
    },
    post: {
      tags: ['24. Admin - Tutor Payouts'],
      summary: 'Record New Tutor Payout',
      description: 'Creates a payout record, deducting from the tutor unpaid balance.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tutor_id', 'amount'],
              properties: {
                tutor_id: { type: 'integer', example: 2 },
                amount: { type: 'number', example: 35000.00 },
                payment_method: { type: 'string', example: 'bank_transfer' },
                transaction_reference: { type: 'string', example: 'NEFT8921387' },
                note: { type: 'string', example: 'September revenue payout' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Payout recorded' }
      }
    }
  },

  '/admin/payouts/{payoutId}': {
    patch: {
      tags: ['24. Admin - Tutor Payouts'],
      summary: 'Update Payout Status',
      description: 'Marks payout as processing, paid, failed, or cancelled.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'payoutId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Payout status updated' }
      }
    }
  },

  // Admin Certificate Actions
  '/admin/certificates/generate': {
    post: {
      tags: ['17. Course Management - Certificates'],
      summary: 'Manually Generate Certificate for Enrollment (Admin)',
      description: 'Force generates a pending or issued certificate for a student enrollment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['enrollment_id'],
              properties: {
                enrollment_id: { type: 'integer', example: 50 },
                issue: { type: 'boolean', default: false }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Certificate generated' }
      }
    }
  },

  '/admin/certificates/{certificateId}/revoke': {
    post: {
      tags: ['17. Course Management - Certificates'],
      summary: 'Revoke Issued Certificate (Admin)',
      description: 'Revokes a previously issued certificate, disabling verification and notifying the student.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'certificateId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reason: { type: 'string', example: 'Plagiarism detected in capstone submission.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Certificate revoked' }
      }
    }
  },

  // Moderation
  '/admin/community/posts': {
    get: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'List Community Posts for Moderation',
      description: 'Lists posts across all statuses (pending, published, hidden, deleted).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Posts moderation list' }
      }
    }
  },

  '/admin/community/posts/{postId}': {
    get: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Get Community Post with All Comments',
      description: 'Returns post and threaded comments for moderation.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Post and comments' }
      }
    }
  },

  '/admin/community/posts/{postId}/status': {
    patch: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Moderate Community Post Status',
      description: 'Updates status to published, hidden, deleted, or pending and notifies author.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['published', 'hidden', 'deleted', 'pending'] },
                reason: { type: 'string', example: 'Violates community guidelines.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Post moderated' }
      }
    }
  },

  '/admin/community/posts/{postId}': {
    delete: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Hard Delete Community Post',
      description: 'Permanently removes post and all comments from database.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Post permanently deleted' }
      }
    }
  },

  '/admin/community/comments': {
    get: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'List Community Comments for Moderation',
      description: 'Lists comments across posts.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Comments list' }
      }
    }
  },

  '/admin/community/comments/{commentId}/status': {
    patch: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Moderate Community Comment',
      description: 'Changes comment status (visible, hidden, deleted).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'commentId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['visible', 'hidden', 'deleted'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comment status updated' }
      }
    }
  },

  '/admin/reviews': {
    get: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'List Course Reviews for Moderation',
      description: 'Lists reviews, filterable by pending approval status.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Reviews list' }
      }
    }
  },

  '/admin/reviews/{reviewId}/moderate': {
    patch: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Moderate Single Review',
      description: 'Approve or reject a review.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['approved', 'rejected', 'pending'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Review moderated' }
      }
    }
  },

  '/admin/reviews/bulk-moderate': {
    patch: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Bulk Moderate Reviews',
      description: 'Approve or reject multiple reviews in a single batch.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['ids', 'status'],
              properties: {
                ids: { type: 'array', items: { type: 'integer' } },
                status: { type: 'string', enum: ['approved', 'rejected'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Reviews bulk moderated' }
      }
    }
  },

  '/admin/reviews/{reviewId}': {
    delete: {
      tags: ['25. Admin - Community & Review Moderation'],
      summary: 'Delete Review',
      description: 'Permanently deletes review.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Review deleted' }
      }
    }
  },

  // Communications & Notifications
  '/admin/communications': {
    get: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'List Broadcast Communications History',
      description: 'Lists previous email and WhatsApp broadcast campaigns.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Communications history' }
      }
    },
    post: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'Broadcast Email or WhatsApp Message',
      description: `Dispatches personalized messages to audiences (student, tutor, all_students, all_tutors, all_users). Supports variable interpolation like \`{{first_name}}\`.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['channel', 'recipient_type', 'message'],
              properties: {
                channel: { type: 'string', enum: ['email', 'whatsapp'], example: 'email' },
                recipient_type: { type: 'string', enum: ['student', 'tutor', 'all_students', 'all_tutors', 'all_users'], example: 'all_students' },
                recipient_id: { type: 'integer', description: 'Required when recipient_type is student or tutor' },
                subject: { type: 'string', example: 'Exciting New Feature Announcement' },
                message: { type: 'string', example: 'Hello {{first_name}}, check out our new live classes!' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Communication queued and dispatched' }
      }
    }
  },

  '/admin/communications/{communicationId}': {
    get: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'Get Communication Detail',
      description: 'Message content, delivery count, and error records.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'communicationId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Communication detail' }
      }
    }
  },

  '/admin/communications/{communicationId}/resend': {
    post: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'Resend Communication Broadcast',
      description: 'Re-dispatches previous broadcast campaign.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'communicationId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Broadcast resent' }
      }
    }
  },

  '/admin/notifications': {
    get: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'List In-App Admin Notification History',
      description: 'Lists broadcast notification records sent by administrators.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Notifications history' }
      }
    },
    post: {
      tags: ['26. Admin - Communications & Notifications'],
      summary: 'Send Targeted In-App Notification',
      description: 'Sends real-time in-app notification via database and Socket.io to target audience.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['audience', 'title', 'message'],
              properties: {
                audience: { type: 'string', enum: ['user', 'all_students', 'all_tutors', 'all_users', 'course_students'], example: 'all_students' },
                user_id: { type: 'integer', description: 'When audience is user' },
                course_id: { type: 'integer', description: 'When audience is course_students' },
                title: { type: 'string', example: 'Platform Maintenance Notice' },
                message: { type: 'string', example: 'Scheduled maintenance this Sunday at 2 AM IST.' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Notification sent' }
      }
    }
  },

  // Reports
  '/admin/reports/{type}': {
    get: {
      tags: ['27. Admin - Reports & Analytics'],
      summary: 'Generate Analytical Report (JSON or CSV)',
      description: 'Generates report data on the fly. Types: student, tutor, course, sales. Use ?format=csv to download direct CSV.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['student', 'tutor', 'course', 'sales'] } },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'course_id', in: 'query', schema: { type: 'integer' } }
      ],
      responses: {
        200: { description: 'Report data in JSON or CSV stream' }
      }
    }
  },

  '/admin/reports/{type}/export': {
    post: {
      tags: ['27. Admin - Reports & Analytics'],
      summary: 'Queue Background CSV Report Export',
      description: 'Exports large report to CSV file and records report export entry.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['student', 'tutor', 'course', 'sales'] } }
      ],
      responses: {
        201: { description: 'Report export generated' }
      }
    }
  },

  '/admin/report-exports': {
    get: {
      tags: ['27. Admin - Reports & Analytics'],
      summary: 'List Exported Report Files',
      description: 'Lists all generated CSV report files available for download.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Report exports list' }
      }
    }
  },

  '/admin/report-exports/{exportId}/download': {
    get: {
      tags: ['27. Admin - Reports & Analytics'],
      summary: 'Download Exported Report CSV',
      description: 'Streams the previously exported CSV report file.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'exportId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'CSV file download' }
      }
    }
  },

  // CMS
  '/admin/cms/pages': {
    get: {
      tags: ['28. Admin - Website CMS'],
      summary: 'List CMS Static Pages',
      description: 'Lists all static content pages.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Pages list' }
      }
    },
    post: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Create Static Page',
      description: 'Creates a static page with title, slug, HTML content, and SEO metadata.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', example: 'Privacy Policy' },
                slug: { type: 'string', example: 'privacy-policy' },
                content: { type: 'string', example: '<h1>Privacy Policy</h1><p>We respect your privacy...</p>' },
                meta_title: { type: 'string' },
                meta_description: { type: 'string' },
                status: { type: 'string', enum: ['draft', 'published', 'inactive'], default: 'published' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Page created' }
      }
    }
  },

  '/admin/cms/pages/{pageId}': {
    get: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Get Static Page Detail',
      description: 'Returns static page content for editing.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'pageId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Page details' }
      }
    },
    put: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Update Static Page',
      description: 'Updates page content, status, and metadata.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'pageId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                status: { type: 'string', enum: ['draft', 'published', 'inactive'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Page updated' }
      }
    },
    delete: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Delete Static Page',
      description: 'Deletes static page.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'pageId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Page deleted' }
      }
    }
  },

  '/admin/cms/contents': {
    get: {
      tags: ['28. Admin - Website CMS'],
      summary: 'List All Dynamic Homepage Content Blocks',
      description: 'Lists hero, features, FAQ, footer, and featured courses configuration blocks.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'CMS content blocks' }
      }
    }
  },

  '/admin/cms/contents/{sectionKey}': {
    get: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Get Specific Content Block',
      description: 'Returns content block by key.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'sectionKey', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Content block' }
      }
    },
    put: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Upsert Dynamic Content Block',
      description: 'Updates or creates content block with image upload and JSON structured data.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'sectionKey', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                data: { type: 'string', description: 'JSON string for custom fields' },
                status: { type: 'string', enum: ['active', 'inactive'] },
                image: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Content block saved' }
      }
    },
    delete: {
      tags: ['28. Admin - Website CMS'],
      summary: 'Delete Content Block',
      description: 'Removes content block.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'sectionKey', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Content block deleted' }
      }
    }
  },

  // Settings
  '/admin/settings': {
    get: {
      tags: ['29. Admin - System Settings'],
      summary: 'Get System Settings by Group',
      description: 'Returns all system configurations grouped by general, payment, email, whatsapp, zoom and storage (Vimeo + Cloudflare R2). Secret credentials are automatically masked.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'group', in: 'query', schema: { type: 'string', enum: ['general', 'payment', 'email', 'whatsapp', 'zoom', 'storage'] } }
      ],
      responses: {
        200: { description: 'Settings dictionary' }
      }
    }
  },

  '/admin/settings/{group}': {
    put: {
      tags: ['29. Admin - System Settings'],
      summary: 'Save Settings for Group',
      description: 'Updates configuration key-values for a specific group in database.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'group', in: 'path', required: true, schema: { type: 'string', enum: ['general', 'payment', 'email', 'whatsapp', 'zoom', 'storage'] } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              example: {
                site_name: 'ATV Academy',
                lecture_completion_threshold: 90,
                tutor_revenue_share_percent: 70
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Settings saved and cache invalidated' }
      }
    }
  },

  '/admin/settings/email/test': {
    post: {
      tags: ['29. Admin - System Settings'],
      summary: 'Test SMTP Email Settings',
      description: 'Sends a test email to the authenticated admin to verify SMTP configuration.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Test email sent successfully' },
        500: { description: 'SMTP connection failed' }
      }
    }
  },

  '/admin/settings/whatsapp/test': {
    post: {
      tags: ['29. Admin - System Settings'],
      summary: 'Test WhatsApp Cloud API Integration',
      description: 'Sends a test WhatsApp message to the admin phone number.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'WhatsApp message sent' },
        500: { description: 'WhatsApp API error' }
      }
    }
  },

  '/admin/settings/zoom/test': {
    post: {
      tags: ['29. Admin - System Settings'],
      summary: 'Test Zoom Server-to-Server OAuth Integration',
      description: 'Verifies Zoom credentials by requesting an OAuth token and checking API connectivity.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Zoom OAuth verified' },
        500: { description: 'Zoom authentication failed' }
      }
    }
  },

  '/admin/settings/storage/test': {
    post: {
      tags: ['29. Admin - System Settings'],
      summary: 'Test Storage (Vimeo + Cloudflare R2)',
      description: `Checks Vimeo (access token + scopes) and Cloudflare R2 (bucket access) separately.
Storage keys (PUT /admin/settings/storage, or .env): \`storage_driver\` (auto | cloud | local),
Vimeo: \`vimeo_access_token\`, \`vimeo_folder_id\`, \`vimeo_privacy_view\` (disable | unlisted | nobody | anybody), \`vimeo_embed_domains\`, \`vimeo_use_direct_links\`;
R2: \`cloudflare_account_id\`, \`cloudflare_r2_access_key_id\`, \`cloudflare_r2_secret_access_key\`, \`cloudflare_r2_bucket\`, \`cloudflare_r2_public_url\` (public bucket / custom domain for images).`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'All configured services reachable',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    example: {
                      driver: 'auto',
                      vimeo: { configured: true, ok: true, account: 'standard', user: 'ATV Academy', scopes: 'public private create edit delete upload video_files', free_space_bytes: 4308362197378 },
                      r2: { configured: true, ok: true, bucket: 'atv-media', public_url: 'https://media.atvacademy.com' }
                    }
                  }
                }
              }
            }
          }
        },
        502: { description: 'A configured service failed (see data.vimeo.error / data.r2.error)' }
      }
    }
  }
};

export default adminPaths;
