/**
 * In-App Notifications Endpoints (All Roles)
 */

export const notificationPaths = {
  '/notifications': {
    get: {
      tags: ['31. Notifications'],
      summary: 'Get In-App Notifications',
      description: 'Paginated notifications for the logged-in user with status (unread / read) filter.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['unread', 'read'] } },
        { name: 'type', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Notifications list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      notifications: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                      unread_count: { type: 'integer', example: 3 }
                    }
                  },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        }
      }
    },
    delete: {
      tags: ['31. Notifications'],
      summary: 'Clear Notifications',
      description: 'Clears notifications. By default deletes only read notifications, or all with ?only_read=false.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [
        { name: 'only_read', in: 'query', schema: { type: 'boolean', default: true } }
      ],
      responses: {
        200: { description: 'Notifications cleared' }
      }
    }
  },

  '/notifications/unread-count': {
    get: {
      tags: ['31. Notifications'],
      summary: 'Get Unread Notification Count',
      description: 'Quick counter endpoint for navbar bell badge.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Unread counter',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      unread_count: { type: 'integer', example: 3 }
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

  '/notifications/read-all': {
    patch: {
      tags: ['31. Notifications'],
      summary: 'Mark All Notifications as Read',
      description: 'Marks all unread notifications (or an array of specified notification IDs) as read.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ids: { type: 'array', items: { type: 'integer' } }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Notifications marked as read' }
      }
    }
  },

  '/notifications/{notificationId}/read': {
    patch: {
      tags: ['31. Notifications'],
      summary: 'Mark Notification as Read',
      description: 'Marks single notification as read.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'notificationId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Notification marked as read' }
      }
    }
  },

  '/notifications/{notificationId}/unread': {
    patch: {
      tags: ['31. Notifications'],
      summary: 'Mark Notification as Unread',
      description: 'Marks single notification as unread.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'notificationId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Notification marked as unread' }
      }
    }
  },

  '/notifications/{notificationId}': {
    delete: {
      tags: ['31. Notifications'],
      summary: 'Delete Single Notification',
      description: 'Permanently removes a notification.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      parameters: [{ name: 'notificationId', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'Notification deleted' }
      }
    }
  }
};

export default notificationPaths;
