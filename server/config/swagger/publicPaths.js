/**
 * Public Website Endpoints (No Authentication Required)
 */

export const publicPaths = {
  '/public/home': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Homepage Composite Data',
      description: 'Returns active CMS blocks, featured courses, newest courses, popular courses, active categories, student testimonials, and system counters.',
      security: [],
      responses: {
        200: {
          description: 'Homepage data payload',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      contents: { type: 'object' },
                      featured_courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } },
                      latest_courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } },
                      popular_courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } },
                      categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
                      testimonials: { type: 'array', items: { $ref: '#/components/schemas/Review' } },
                      stats: {
                        type: 'object',
                        properties: {
                          students: { type: 'integer', example: 1250 },
                          tutors: { type: 'integer', example: 45 },
                          courses: { type: 'integer', example: 80 }
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

  '/public/contents/{sectionKey}': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Specific CMS Content Block',
      description: 'Fetches content for a section key such as hero, features, faq, footer, or about.',
      security: [],
      parameters: [
        {
          name: 'sectionKey',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'hero' },
          description: 'Unique section key identifier'
        }
      ],
      responses: {
        200: {
          description: 'Content block found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      content: { $ref: '#/components/schemas/CmsContent' }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Content block not found' }
      }
    }
  },

  '/public/settings': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Public Site Settings',
      description: 'Returns safe, public-facing configurations (site name, logo, support contact, currency, tax percent, Razorpay key ID).',
      security: [],
      responses: {
        200: {
          description: 'Public settings dictionary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      settings: { type: 'object' }
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

  '/public/categories': {
    get: {
      tags: ['4. Public Website'],
      summary: 'List Active Course Categories',
      description: 'Lists all active categories with published course counts.',
      security: [],
      responses: {
        200: {
          description: 'Categories list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } }
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

  '/public/courses': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Search & Filter Course Catalog',
      description: 'Paginated public course directory with full-text search, multiple filters, and flexible sorting.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search term for course title and summary' },
        { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Category slug or ID' },
        { name: 'category_id', in: 'query', schema: { type: 'integer' }, description: 'Category ID' },
        { name: 'level', in: 'query', schema: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'all'] } },
        { name: 'language', in: 'query', schema: { type: 'string' } },
        { name: 'price', in: 'query', schema: { type: 'string', enum: ['free', 'paid'] } },
        { name: 'min_price', in: 'query', schema: { type: 'number' } },
        { name: 'max_price', in: 'query', schema: { type: 'number' } },
        { name: 'tutor_id', in: 'query', schema: { type: 'integer' } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'oldest', 'popular', 'rating', 'price_asc', 'price_desc', 'title'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 12 } }
      ],
      responses: {
        200: {
          description: 'Paginated course results',
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

  '/public/courses/{identifier}': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Course Details by ID or Slug',
      description: `Retrieves complete public course information including curriculum sections, published lectures with preview flags, tutor profiles, rating breakdowns, and contextual viewer state (enrolled, in wishlist, in cart) when user is logged in.`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        {
          name: 'identifier',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'complete-full-stack-mern-architecture' },
          description: 'Numeric Course ID or URL slug'
        }
      ],
      responses: {
        200: {
          description: 'Course details retrieved',
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
                      includes: {
                        type: 'object',
                        properties: {
                          recorded_videos: { type: 'integer', example: 45 },
                          quizzes: { type: 'integer', example: 8 },
                          final_project: { type: 'boolean', example: true },
                          upcoming_live_classes: { type: 'integer', example: 2 },
                          certificate: { type: 'boolean', example: true },
                          lifetime_community_access: { type: 'boolean', example: true }
                        }
                      },
                      rating_breakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            rating: { type: 'integer' },
                            count: { type: 'integer' }
                          }
                        }
                      },
                      viewer: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          is_enrolled: { type: 'boolean', example: false },
                          enrollment_id: { type: 'integer', nullable: true },
                          completion_percentage: { type: 'number', nullable: true },
                          in_wishlist: { type: 'boolean', example: true },
                          in_cart: { type: 'boolean', example: false },
                          can_manage: { type: 'boolean', example: false }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Course not found or not published' }
      }
    }
  },

  '/public/courses/{courseId}/reviews': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Approved Course Reviews',
      description: 'Paginated list of approved student reviews and star ratings for a specific course.',
      security: [],
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
      ],
      responses: {
        200: {
          description: 'Reviews list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
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

  '/public/tutors': {
    get: {
      tags: ['4. Public Website'],
      summary: 'List Public Tutors',
      description: 'Returns active tutors with at least one published course, including total course counts, student enrollments, and average rating.',
      security: [],
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'all', in: 'query', schema: { type: 'boolean', default: false } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 12 } }
      ],
      responses: {
        200: {
          description: 'Tutors list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      tutors: { type: 'array', items: { $ref: '#/components/schemas/User' } }
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

  '/public/tutors/{tutorId}': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Public Tutor Profile & Courses',
      description: 'Returns tutor bio, professional links, aggregate ratings, and published courses.',
      security: [],
      parameters: [
        { name: 'tutorId', in: 'path', required: true, schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'Tutor details and courses',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      tutor: { $ref: '#/components/schemas/User' },
                      stats: {
                        type: 'object',
                        properties: {
                          courses: { type: 'integer' },
                          students: { type: 'integer' },
                          reviews: { type: 'integer' },
                          average_rating: { type: 'number' }
                        }
                      },
                      courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Tutor not found' }
      }
    }
  },

  '/public/pages': {
    get: {
      tags: ['4. Public Website'],
      summary: 'List Static Pages',
      description: 'Lists published static pages for site header, footer, and navigation menus.',
      security: [],
      responses: {
        200: {
          description: 'Static pages list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      pages: { type: 'array', items: { $ref: '#/components/schemas/CmsPage' } }
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

  '/public/pages/{slug}': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Get Static Page by Slug',
      description: 'Fetches published static page content by slug (e.g., about, terms-and-conditions, privacy-policy).',
      security: [],
      parameters: [
        { name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'terms-and-conditions' } }
      ],
      responses: {
        200: {
          description: 'Static page content',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      page: { $ref: '#/components/schemas/CmsPage' }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Page not found' }
      }
    }
  },

  '/public/certificates/verify/{certificateNumber}': {
    get: {
      tags: ['4. Public Website'],
      summary: 'Verify Certificate Authenticity',
      description: 'Public endpoint to verify certificate legitimacy. Validates against issued/approved certificates and returns student and course details.',
      security: [],
      parameters: [
        {
          name: 'certificateNumber',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'ATV-2026-CERT-89042' },
          description: 'Unique certificate code'
        }
      ],
      responses: {
        200: {
          description: 'Certificate is valid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Certificate is valid.' },
                  data: {
                    type: 'object',
                    properties: {
                      certificate: {
                        type: 'object',
                        properties: {
                          certificate_number: { type: 'string' },
                          issue_date: { type: 'string', format: 'date' },
                          status: { type: 'string', example: 'issued' },
                          student_name: { type: 'string', example: 'John Doe' },
                          course: {
                            type: 'object',
                            properties: {
                              id: { type: 'integer' },
                              title: { type: 'string' }
                            }
                          },
                          approved_by: { type: 'string', nullable: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: 'Certificate not found or has been revoked' }
      }
    }
  }
};

export default publicPaths;
