/**
 * Shared Management Endpoints (Course Builder, Curriculum, Media, Quizzes, Projects, Live Classes, Certificates)
 * Mounted under both /tutor and /admin.
 */

export const createManagementPaths = (prefix, roleLabel, tagSuffix = '') => {
  const tag = (area) => `Course Management - ${area}${tagSuffix}`;

  return {
    [`${prefix}/courses`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Create Course (${roleLabel})`,
        description: `Creates a new course draft. Accepts multipart form data with thumbnail image. Tutors automatically become assigned to the course.`,
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['title', 'category_id', 'price'],
                properties: {
                  title: { type: 'string', example: 'Advanced System Design & Scalability' },
                  category_id: { type: 'integer', example: 1 },
                  short_description: { type: 'string', example: 'Master distributed systems, caching, and database sharding.' },
                  description: { type: 'string', example: 'In-depth architecture course for senior engineers.' },
                  price: { type: 'number', example: 4999.00 },
                  discount_price: { type: 'number', example: 2999.00 },
                  duration_minutes: { type: 'integer', example: 1200 },
                  level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'all'], example: 'advanced' },
                  language: { type: 'string', example: 'English' },
                  thumbnail: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Course created' },
          422: { description: 'Validation failed' }
        }
      }
    },

    [`${prefix}/courses/{courseId}`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Get Course for Management (${roleLabel})`,
        description: 'Returns course draft with full management details, categories, assigned tutors, and stats.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Course management payload' },
          403: { description: 'Access denied: not authorized for this course' },
          404: { description: 'Course not found' }
        }
      },
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Update Course Details (${roleLabel})`,
        description: 'Updates course title, category, descriptions, pricing, level, and thumbnail.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  category_id: { type: 'integer' },
                  short_description: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number' },
                  discount_price: { type: 'number' },
                  duration_minutes: { type: 'integer' },
                  level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'all'] },
                  thumbnail: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Course updated successfully' }
        }
      },
      delete: {
        tags: [tag('Curriculum & Media')],
        summary: `Delete Course (${roleLabel})`,
        description: 'Deletes course draft if no enrolled students exist.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Course deleted' },
          409: { description: 'Cannot delete course with active enrollments' }
        }
      }
    },

    [`${prefix}/courses/{courseId}/submit`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Submit Course for Review (${roleLabel})`,
        description: 'Submits a completed course draft to administrators for review and approval.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Course status changed to pending review' }
        }
      }
    },

    [`${prefix}/courses/{courseId}/status`]: {
      patch: {
        tags: [tag('Curriculum & Media')],
        summary: `Change Course Status (${roleLabel})`,
        description: 'Transitions course status according to allowed role workflow.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['draft', 'pending', 'approved', 'published', 'rejected', 'archived'] }
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

    [`${prefix}/courses/{courseId}/stats`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Get Course Statistics (${roleLabel})`,
        description: 'Returns student counts, completed count, revenue, rating, and engagement stats.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Course performance statistics' }
        }
      }
    },

    // Curriculum: Sections & Lectures
    [`${prefix}/courses/{courseId}/curriculum`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Get Curriculum Tree (${roleLabel})`,
        description: 'Returns complete hierarchy of sections and lectures with attached videos, quizzes, and resources.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Curriculum tree' }
        }
      }
    },

    [`${prefix}/courses/{courseId}/sections`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Create Section (${roleLabel})`,
        description: 'Creates a new curriculum section for the course.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Section 2: Caching & Distributed State' },
                  description: { type: 'string', example: 'Redis, Memcached, cache invalidation strategies.' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Section created' }
        }
      }
    },

    [`${prefix}/courses/{courseId}/sections/reorder`]: {
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Reorder Sections (${roleLabel})`,
        description: 'Updates sort_order for sections based on array of section IDs.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['section_ids'],
                properties: {
                  section_ids: { type: 'array', items: { type: 'integer' }, example: [102, 101, 103] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Sections reordered' }
        }
      }
    },

    [`${prefix}/sections/{sectionId}`]: {
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Update Section (${roleLabel})`,
        description: 'Updates section title and description.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Section updated' }
        }
      },
      delete: {
        tags: [tag('Curriculum & Media')],
        summary: `Delete Section (${roleLabel})`,
        description: 'Deletes section and cascading contents.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Section deleted' }
        }
      }
    },

    [`${prefix}/sections/{sectionId}/lectures`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Create Lecture (${roleLabel})`,
        description: 'Adds a lecture (video, text, document, quiz, or live class) into a section.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Cache Aside vs Write-Through Patterns' },
                  description: { type: 'string' },
                  lecture_type: { type: 'string', enum: ['video', 'text', 'document', 'quiz', 'live_class'], default: 'video' },
                  duration_seconds: { type: 'integer', example: 900 },
                  is_preview: { type: 'boolean', default: false }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Lecture created' }
        }
      }
    },

    [`${prefix}/sections/{sectionId}/lectures/reorder`]: {
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Reorder Lectures (${roleLabel})`,
        description: 'Reorders lectures within a section.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lecture_ids'],
                properties: {
                  lecture_ids: { type: 'array', items: { type: 'integer' } }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Lectures reordered' }
        }
      }
    },

    [`${prefix}/lectures/{lectureId}`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Get Lecture Details (${roleLabel})`,
        description: 'Returns lecture content, attached media, quizzes, and resources.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Lecture details' }
        }
      },
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Update Lecture (${roleLabel})`,
        description: 'Updates lecture title, content, type, duration, preview status, and publish state.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  lecture_type: { type: 'string', enum: ['video', 'text', 'document', 'quiz', 'live_class'] },
                  duration_seconds: { type: 'integer' },
                  is_preview: { type: 'boolean' },
                  status: { type: 'string', enum: ['draft', 'published', 'inactive'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Lecture updated' }
        }
      },
      delete: {
        tags: [tag('Curriculum & Media')],
        summary: `Delete Lecture (${roleLabel})`,
        description: 'Deletes lecture and recalculates course progress.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'lectureId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Lecture deleted' }
        }
      }
    },

    // Resources
    [`${prefix}/courses/{courseId}/resources`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `List Course Resources (${roleLabel})`,
        description: 'Lists all uploaded resource files.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Resources list' }
        }
      },
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Upload Course Resource (${roleLabel})`,
        description: 'Uploads a document file or attaches an external document URL.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Microservices Architecture Diagram' },
                  lecture_id: { type: 'integer' },
                  resource_file: { type: 'string', format: 'binary' },
                  file_url: { type: 'string', description: 'External URL if not uploading file' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Resource created' }
        }
      }
    },

    [`${prefix}/resources/{resourceId}`]: {
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Update Resource (${roleLabel})`,
        description: 'Updates resource metadata or replaces document file.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'resourceId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  lecture_id: { type: 'integer' },
                  resource_file: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Resource updated' }
        }
      },
      delete: {
        tags: [tag('Curriculum & Media')],
        summary: `Delete Resource (${roleLabel})`,
        description: 'Removes resource file and database record.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'resourceId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Resource deleted' }
        }
      }
    },

    [`${prefix}/resources/{resourceId}/download`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Download Resource (${roleLabel})`,
        description: 'Downloads course resource file.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'resourceId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'File binary stream' }
        }
      }
    },

    // Recorded Videos
    [`${prefix}/courses/{courseId}/videos`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `List Recorded Videos (${roleLabel})`,
        description: 'Lists all uploaded videos for the course, with optional section_id or unassigned filters.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'section_id', in: 'query', schema: { type: 'integer' } },
          { name: 'unassigned', in: 'query', schema: { type: 'boolean' } }
        ],
        responses: {
          200: { description: 'Videos list' }
        }
      },
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Upload Video (${roleLabel})`,
        description: `Adds a video to the course in one of three ways (optionally creating the lecture):
- **video_file** (multipart): uploaded to **Vimeo** (resumable tus) when VIMEO_ACCESS_TOKEN is set, otherwise stored on the server. Vimeo videos start as \`processing\` and become playable when Vimeo finishes transcoding.
- **vimeo_url**: link a video that already exists on your Vimeo account (e.g. https://vimeo.com/1012345678). Its duration / thumbnail are read from Vimeo; deleting the lesson does **not** delete it from Vimeo.
- **video_url**: any other external URL.
The Vimeo player embed URL is saved in \`video_url\` and the Vimeo id in \`vimeo_video_id\`. For large files prefer **POST /courses/{courseId}/videos/direct-upload** (browser uploads straight to Vimeo).`,
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Event Sourcing Deep-Dive' },
                  section_id: { type: 'integer' },
                  lecture_id: { type: 'integer' },
                  duration_seconds: { type: 'integer', example: 1540 },
                  create_lecture: { type: 'boolean', default: false },
                  description: { type: 'string' },
                  is_preview: { type: 'boolean', default: false },
                  video_file: { type: 'string', format: 'binary' },
                  vimeo_url: { type: 'string', example: 'https://vimeo.com/1012345678', description: 'Link an existing video on your Vimeo account' },
                  video_url: { type: 'string', description: 'External video URL (a Vimeo URL here is treated like vimeo_url)' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Video uploaded and recorded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Video uploaded to Vimeo and is processing.' },
                    data: {
                      type: 'object',
                      properties: {
                        video: { $ref: '#/components/schemas/RecordedVideo' },
                        storage_provider: { type: 'string', enum: ['vimeo', 'local', 'external'] }
                      }
                    }
                  }
                }
              }
            }
          },
          404: { description: 'vimeo_url points to a video your Vimeo token cannot access' },
          502: { description: 'Vimeo API error' },
          503: { description: 'STORAGE_DRIVER=cloud but Vimeo is not configured' }
        }
      }
    },

    [`${prefix}/courses/{courseId}/videos/direct-upload`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Create Direct Upload URL - Vimeo (${roleLabel})`,
        description: `Creates the video on Vimeo (hidden, embed-only) plus its record (status \`processing\`) and returns a tus upload URL. The browser uploads the file straight to Vimeo - no size limit on the API server:
\`new tus.Upload(file, { uploadUrl: upload.url, chunkSize: 64 * 1024 * 1024 }).start()\`
\`upload_length\` (exact file size in bytes) is required. Requires VIMEO_ACCESS_TOKEN.`,
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Module 3 - Caching' },
                  description: { type: 'string' },
                  section_id: { type: 'integer', example: 101 },
                  lecture_id: { type: 'integer', description: 'Attach to an existing lecture (section is taken from it)' },
                  create_lecture: { type: 'boolean', default: false },
                  is_preview: { type: 'boolean', default: false },
                  upload_length: { type: 'integer', example: 734003200, description: 'Exact file size in bytes (required)' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Upload target created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        video: { $ref: '#/components/schemas/RecordedVideo' },
                        upload: { $ref: '#/components/schemas/VideoDirectUpload' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Vimeo is not configured, or upload_length is missing' }
        }
      }
    },

    [`${prefix}/videos/{videoId}/sync`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Sync Video Status from Vimeo (${roleLabel})`,
        description: 'Fetches the transcoding state from Vimeo and updates status (processing / ready / failed), duration (also copied to the lecture when empty), embed URL and thumbnail. Normally automatic: a background job checks processing videos every 5 minutes; the uploader is notified if processing fails.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Current status (data.video, data.vimeo)' }
        }
      }
    },

    [`${prefix}/videos/{videoId}/direct-upload`]: {
      post: {
        tags: [tag('Curriculum & Media')],
        summary: `Replace Video via Direct Upload (${roleLabel})`,
        description: 'Creates a new Vimeo video + tus upload URL for this lesson video; the previous file is deleted (if the LMS uploaded it) and the video returns to `processing` until Vimeo finishes transcoding.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  upload_length: { type: 'integer', example: 734003200, description: 'Exact file size in bytes (required)' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Upload target created (data.video, data.upload)' }
        }
      }
    },

    [`${prefix}/videos/{videoId}`]: {
      get: {
        tags: [tag('Curriculum & Media')],
        summary: `Get Video Detail (${roleLabel})`,
        description: 'Returns video metadata, assignment and `playback` (Vimeo embed URL or signed local stream URL) for previewing.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Video details' }
        }
      },
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Update Video Metadata (${roleLabel})`,
        description: 'Updates video title, description, and section/lecture assignment.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  section_id: { type: 'integer' },
                  lecture_id: { type: 'integer' },
                  duration_seconds: { type: 'integer' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Video metadata updated' }
        }
      },
      delete: {
        tags: [tag('Curriculum & Media')],
        summary: `Delete Video (${roleLabel})`,
        description: 'Deletes the lesson video and its watch progress. Files uploaded by the LMS are removed from Vimeo / the server; videos linked from your Vimeo account are left on Vimeo.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Video deleted' }
        }
      }
    },

    [`${prefix}/videos/{videoId}/file`]: {
      put: {
        tags: [tag('Curriculum & Media')],
        summary: `Replace Video Media File (${roleLabel})`,
        description: 'Replaces the video file through the API while preserving lecture IDs and progress counters. Goes to Vimeo when configured (status returns to `processing`); the previous file is deleted if the LMS uploaded it.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'videoId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['video_file'],
                properties: {
                  video_file: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Video file replaced' }
        }
      }
    },

    // Quizzes Management
    [`${prefix}/courses/{courseId}/quizzes`]: {
      get: {
        tags: [tag('Quizzes')],
        summary: `List Quizzes for Course (${roleLabel})`,
        description: 'Lists all quizzes defined for the course.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Quizzes list' }
        }
      },
      post: {
        tags: [tag('Quizzes')],
        summary: `Create Quiz (${roleLabel})`,
        description: 'Creates a quiz with optional nested questions and answer choices in a single request.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'System Design Benchmark Test' },
                  description: { type: 'string' },
                  section_id: { type: 'integer' },
                  lecture_id: { type: 'integer' },
                  passing_marks: { type: 'number', example: 7.00 },
                  time_limit_minutes: { type: 'integer', example: 15 },
                  max_attempts: { type: 'integer', example: 3 },
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['question', 'answers'],
                      properties: {
                        question: { type: 'string', example: 'What is CAP Theorem consistency?' },
                        question_type: { type: 'string', enum: ['single', 'multiple', 'true_false'], default: 'single' },
                        marks: { type: 'number', default: 1 },
                        answers: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['answer_text', 'is_correct'],
                            properties: {
                              answer_text: { type: 'string' },
                              is_correct: { type: 'boolean' }
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
        responses: {
          201: { description: 'Quiz created' }
        }
      }
    },

    [`${prefix}/quizzes/{quizId}`]: {
      get: {
        tags: [tag('Quizzes')],
        summary: `Get Quiz for Management (${roleLabel})`,
        description: 'Returns quiz with complete question bank and answer keys.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Quiz details with questions' }
        }
      },
      put: {
        tags: [tag('Quizzes')],
        summary: `Update Quiz (${roleLabel})`,
        description: 'Updates quiz title, time limit, passing marks, attempts limit, and questions.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  passing_marks: { type: 'number' },
                  time_limit_minutes: { type: 'integer' },
                  max_attempts: { type: 'integer' },
                  status: { type: 'string', enum: ['draft', 'published', 'inactive'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Quiz updated' }
        }
      },
      delete: {
        tags: [tag('Quizzes')],
        summary: `Delete Quiz (${roleLabel})`,
        description: 'Deletes quiz if no attempts exist.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Quiz deleted' }
        }
      }
    },

    [`${prefix}/quizzes/{quizId}/questions`]: {
      post: {
        tags: [tag('Quizzes')],
        summary: `Add Question to Quiz (${roleLabel})`,
        description: 'Appends a new question with answer choices to the quiz.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question', 'answers'],
                properties: {
                  question: { type: 'string' },
                  question_type: { type: 'string', enum: ['single', 'multiple', 'true_false'] },
                  marks: { type: 'number' },
                  answers: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Question added' }
        }
      }
    },

    [`${prefix}/quizzes/{quizId}/questions/reorder`]: {
      put: {
        tags: [tag('Quizzes')],
        summary: `Reorder Quiz Questions (${roleLabel})`,
        description: 'Updates sort_order for questions in quiz.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question_ids'],
                properties: {
                  question_ids: { type: 'array', items: { type: 'integer' } }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Questions reordered' }
        }
      }
    },

    [`${prefix}/questions/{questionId}`]: {
      put: {
        tags: [tag('Quizzes')],
        summary: `Update Question & Answers (${roleLabel})`,
        description: 'Updates question text, marks, and answer choices.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'questionId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  question_type: { type: 'string' },
                  marks: { type: 'number' },
                  answers: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Question updated' }
        }
      },
      delete: {
        tags: [tag('Quizzes')],
        summary: `Delete Question (${roleLabel})`,
        description: 'Removes question and syncs total marks.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'questionId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Question deleted' }
        }
      }
    },

    [`${prefix}/quizzes/{quizId}/results`]: {
      get: {
        tags: [tag('Quizzes')],
        summary: `Get Quiz Student Results (${roleLabel})`,
        description: 'Returns all student attempt scores, pass rates, and submission timestamps.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'quizId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Results list' }
        }
      }
    },

    [`${prefix}/quiz-attempts/{attemptId}`]: {
      get: {
        tags: [tag('Quizzes')],
        summary: `Get Student Attempt Detail (${roleLabel})`,
        description: 'Full inspection of answers submitted by student with grading marks.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'attemptId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Attempt detail' }
        }
      }
    },

    // Projects Management
    [`${prefix}/courses/{courseId}/projects`]: {
      get: {
        tags: [tag('Projects')],
        summary: `List Projects for Course (${roleLabel})`,
        description: 'Returns final projects defined for the course.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Projects list' }
        }
      },
      post: {
        tags: [tag('Projects')],
        summary: `Create Final Project (${roleLabel})`,
        description: 'Defines final project instructions, allowed file types, and max size. Only one active project allowed per course.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Enterprise Architecture Capstone' },
                  instructions: { type: 'string', example: 'Submit architecture document and source code.' },
                  allowed_file_types: { type: 'array', items: { type: 'string' }, example: ['zip', 'pdf'] },
                  max_file_size_mb: { type: 'number', example: 50 },
                  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Project created' }
        }
      }
    },

    [`${prefix}/projects/{projectId}`]: {
      get: {
        tags: [tag('Projects')],
        summary: `Get Project Detail (${roleLabel})`,
        description: 'Returns project instructions and requirements.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Project details' }
        }
      },
      put: {
        tags: [tag('Projects')],
        summary: `Update Project (${roleLabel})`,
        description: 'Updates project title, instructions, and file limits.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  instructions: { type: 'string' },
                  allowed_file_types: { type: 'array', items: { type: 'string' } },
                  max_file_size_mb: { type: 'number' },
                  status: { type: 'string', enum: ['active', 'inactive'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Project updated' }
        }
      },
      delete: {
        tags: [tag('Projects')],
        summary: `Delete Project (${roleLabel})`,
        description: 'Deletes project if no submissions exist.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Project deleted' }
        }
      }
    },

    [`${prefix}/project-submissions`]: {
      get: {
        tags: [tag('Projects')],
        summary: `List Project Submissions (${roleLabel})`,
        description: 'Lists submissions awaiting review or already graded, filterable by status and course_id.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['submitted', 'under_review', 'approved', 'rejected', 'resubmission_required'] } },
          { name: 'course_id', in: 'query', schema: { type: 'integer' } },
          { name: 'project_id', in: 'query', schema: { type: 'integer' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: { description: 'Submissions list' }
        }
      }
    },

    [`${prefix}/project-submissions/{submissionId}`]: {
      get: {
        tags: [tag('Projects')],
        summary: `Get Project Submission Detail (${roleLabel})`,
        description: 'Returns student submission details, notes, file metadata, and review history.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'submissionId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Submission detail' }
        }
      }
    },

    [`${prefix}/project-submissions/{submissionId}/download`]: {
      get: {
        tags: [tag('Projects')],
        summary: `Download Student Project File (${roleLabel})`,
        description: 'Streams the uploaded student project archive to the reviewer.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'submissionId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'File download stream' }
        }
      }
    },

    [`${prefix}/project-submissions/{submissionId}/review`]: {
      put: {
        tags: [tag('Projects')],
        summary: `Review & Grade Project Submission (${roleLabel})`,
        description: `Approve, reject, or request changes on a student's final project.
**90% completion rule - phase 3.** \`approved\` takes the course to 100% (enrollment completed) and issues the certificate immediately - the student can view/download it.
\`rejected\` / \`resubmission_required\` (feedback required) notify the student; progress stays at 90% and they can resubmit.`,
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'submissionId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['under_review', 'approved', 'rejected', 'resubmission_required'] },
                  tutor_feedback: { type: 'string', example: 'Great architecture design. Ready for production deployment.' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Review saved and student notified' }
        }
      }
    },

    // Certificates Management
    [`${prefix}/certificates`]: {
      get: {
        tags: [tag('Certificates')],
        summary: `List Certificates for Review (${roleLabel})`,
        description: 'Lists certificates, filterable by status (default: pending approval) and course_id.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'issued', 'revoked'] } },
          { name: 'course_id', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: { description: 'Certificates list' }
        }
      }
    },

    [`${prefix}/certificates/{certificateId}/review`]: {
      get: {
        tags: [tag('Certificates')],
        summary: `Review Student Completion Prior to Approval (${roleLabel})`,
        description: 'Displays all completion criteria (lecture progress, approved final project, quiz attempts) so tutor can verify before signing.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'certificateId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Completion review packet' }
        }
      }
    },

    [`${prefix}/certificates/{certificateId}/approve`]: {
      post: {
        tags: [tag('Certificates')],
        summary: `Approve and Issue Certificate (${roleLabel})`,
        description: 'Signs and issues certificate to the student. Renders PDF and notifies student.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'certificateId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Certificate approved and issued' }
        }
      }
    },

    [`${prefix}/certificates/{certificateId}/download`]: {
      get: {
        tags: [tag('Certificates')],
        summary: `Staff PDF Preview of Certificate (${roleLabel})`,
        description: 'Streams the rendered PDF certificate for preview.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'certificateId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'PDF stream' }
        }
      }
    },

    // Live Classes (Zoom)
    [`${prefix}/live-classes`]: {
      get: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `List Live Classes (${roleLabel})`,
        description: 'Lists scheduled and past live classes with attendee counts.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'course_id', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['scheduled', 'live', 'completed', 'cancelled'] } },
          { name: 'upcoming', in: 'query', schema: { type: 'boolean' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: { description: 'Live classes list' }
        }
      },
      post: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Schedule Live Class (${roleLabel})`,
        description: `Creates a live class. If Zoom integration is enabled and configured, automatically calls Zoom API to create the meeting and save join/start URLs.`,
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['course_id', 'title', 'scheduled_start', 'scheduled_end'],
                properties: {
                  course_id: { type: 'integer', example: 10 },
                  tutor_id: { type: 'integer', description: 'Required for admin creating class' },
                  title: { type: 'string', example: 'Weekend Microservices Workshop' },
                  description: { type: 'string' },
                  scheduled_start: { type: 'string', format: 'date-time', example: '2026-10-10T14:00:00.000Z' },
                  scheduled_end: { type: 'string', format: 'date-time', example: '2026-10-10T16:00:00.000Z' },
                  timezone: { type: 'string', default: 'Asia/Kolkata' },
                  create_zoom_meeting: { type: 'boolean', default: true },
                  zoom_join_url: { type: 'string', description: 'Optional manual link if not using auto-Zoom' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Live class created' }
        }
      }
    },

    [`${prefix}/live-classes/{classId}`]: {
      get: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Get Live Class Details (${roleLabel})`,
        description: 'Returns meeting schedule, Zoom links, and enrolled participant numbers.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Live class details' }
        }
      },
      put: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Update Live Class (${roleLabel})`,
        description: 'Updates class schedule or Zoom meeting properties.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  scheduled_start: { type: 'string', format: 'date-time' },
                  scheduled_end: { type: 'string', format: 'date-time' },
                  zoom_join_url: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Live class updated' }
        }
      },
      patch: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Update Live Class Status (${roleLabel})`,
        description: 'Toggles status (scheduled, live, completed, cancelled). Marks absentees when completed.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['scheduled', 'live', 'completed', 'cancelled'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Status updated' }
        }
      },
      delete: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Delete Live Class (${roleLabel})`,
        description: 'Deletes live class and associated Zoom meeting.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Live class deleted' }
        }
      }
    },

    [`${prefix}/live-classes/{classId}/start`]: {
      get: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Get Host Start Link (${roleLabel})`,
        description: 'Returns Zoom host start URL for instructor to launch and moderate the live meeting.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Host start URL' }
        }
      }
    },

    [`${prefix}/live-classes/{classId}/attendance`]: {
      get: {
        tags: [tag('Live Classes (Zoom)')],
        summary: `Get Live Class Attendance Report (${roleLabel})`,
        description: 'Returns enrolled students who attended (joined) and who were absent.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: 'classId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Attendance records' }
        }
      }
    }
  };
};

export default createManagementPaths;
