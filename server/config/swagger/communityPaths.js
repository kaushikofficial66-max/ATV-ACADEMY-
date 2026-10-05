/**
 * Community Feed, Discussions & Social Endpoints
 */

export const communityPaths = {
  '/community/feed': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Get Community Feed Posts',
      description: `Returns posts from the lifetime developer community. Filterable by scope (general, courses, mine), course_id, and search terms. Requires lifetime community access (unlocked upon purchasing any course).`,
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'scope', in: 'query', schema: { type: 'string', enum: ['general', 'courses', 'mine'] } },
        { name: 'course_id', in: 'query', schema: { type: 'integer' }, description: 'View specific course discussion board' },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'author_id', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Feed posts list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      posts: { type: 'array', items: { $ref: '#/components/schemas/CommunityPost' } }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        },
        403: { description: 'Purchase any course to unlock lifetime community access' }
      }
    }
  },

  '/community/courses': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Get Course Discussion Boards',
      description: 'Returns courses the user has access to participate in discussion threads for.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Discussion courses list' }
      }
    }
  },

  '/community/notifications': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Get Community Alerts',
      description: 'Recent likes, replies, and mentions within community discussions.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Community alerts' }
      }
    }
  },

  '/community/posts': {
    post: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Create Community Post',
      description: 'Creates a post in general feed or specific course discussion board. Supports optional image attachment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'What are your preferred strategies for managing distributed database transactions?' },
                course_id: { type: 'integer', description: 'Null for general feed, or course ID for course discussion' },
                attachment: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Post created' }
      }
    }
  },

  '/community/posts/{postId}': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Get Post Detail',
      description: 'Returns post content, author, like counts, and comments count.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Post details' },
        404: { description: 'Post not found' }
      }
    },
    put: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Update Post',
      description: 'Author can update post content and attachment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                attachment: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Post updated' }
      }
    },
    delete: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Delete Post',
      description: 'Author or admin can delete post.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Post deleted' }
      }
    }
  },

  '/community/posts/{postId}/comments': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'List Threaded Comments for Post',
      description: 'Returns threaded hierarchical discussion comments on a post.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Comments list' }
      }
    },
    post: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Add Comment or Reply',
      description: 'Adds comment to post or a reply to an existing comment using parent_comment_id.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'We utilize the Saga pattern with choreography.' },
                parent_comment_id: { type: 'integer', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Comment added' }
      }
    }
  },

  '/community/comments/{commentId}': {
    put: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Update Comment',
      description: 'Author can edit comment text.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'commentId', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comment updated' }
      }
    },
    delete: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Delete Comment',
      description: 'Author or admin can delete comment.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'commentId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Comment deleted' }
      }
    }
  },

  '/community/posts/{postId}/like': {
    post: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'Toggle Like on Post',
      description: 'Likes or unlikes post.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'Like toggled',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      liked: { type: 'boolean', example: true },
                      like_count: { type: 'integer', example: 25 }
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

  '/community/posts/{postId}/likes': {
    get: {
      tags: ['30. Community - Feed, Discussions & Social'],
      summary: 'List Users Who Liked Post',
      description: 'Returns profile avatars of users who liked the post.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Likes list' }
      }
    }
  }
};

export default communityPaths;
