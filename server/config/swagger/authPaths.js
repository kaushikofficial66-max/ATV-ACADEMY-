/**
 * Authentication and User Account Management Endpoints
 */

export const authPaths = {
  '/auth/register': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Register a New Student or Tutor Account',
      description: `Creates a new student or tutor account. Students are activated immediately (unless email verification is strictly required by site settings). Tutors are created with \`pending\` status awaiting administrator review and approval.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['first_name', 'email', 'password'],
              properties: {
                first_name: { type: 'string', example: 'Aarav' },
                last_name: { type: 'string', example: 'Sharma' },
                email: { type: 'string', format: 'email', example: 'aarav.sharma@example.com' },
                password: { type: 'string', format: 'password', minLength: 8, example: 'Pass1234!' },
                phone: { type: 'string', example: '+919876543210' },
                role: { type: 'string', enum: ['student', 'tutor'], default: 'student', example: 'student' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Account successfully registered',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Account created successfully.' },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      token: { type: 'string', nullable: true, example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                      verification_email_sent: { type: 'boolean', example: true }
                    }
                  }
                }
              }
            }
          }
        },
        409: { description: 'Email address or phone number already in use' },
        422: { description: 'Input validation failed' }
      }
    }
  },

  '/auth/login': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Authenticate User & Issue Session',
      description: `Logs in a user with email and password. Returns a JWT in the JSON response payload and sets an httpOnly session cookie. Verifies that account is active and not blocked or awaiting email verification.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'admin@atvacademy.com' },
                password: { type: 'string', format: 'password', example: 'Admin@12345' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Login successful.' },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Invalid email or password' },
        403: { description: 'Account blocked, inactive, or unverified email' },
        429: { description: 'Too many failed login attempts' }
      }
    }
  },

  '/auth/logout': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Log Out & Clear Session Cookie',
      description: 'Clears the httpOnly authorization cookie from the client browser.',
      security: [],
      responses: {
        200: {
          description: 'Logged out successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Logged out successfully.' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/auth/me': {
    get: {
      tags: ['2. Authentication'],
      summary: 'Get Authenticated User Profile',
      description: 'Returns the currently authenticated user with associated role and profile metadata.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Current user profile',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Authentication required or token expired' }
      }
    }
  },

  '/auth/verify-email': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Verify Account Email Address (API / frontend)',
      description: `Confirms the email address using the **verification token from the emailed link** (64 hex characters, the part after \`?token=\`).
**Not** the login JWT returned by register/login. Send it in the JSON body (or as \`?token=\`).
Users clicking the email link are handled by the GET variant below.`,
      security: [],
      parameters: [
        { name: 'token', in: 'query', required: false, schema: { type: 'string' }, description: 'Alternative to the JSON body' }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: { type: 'string', example: 'f850ac54041150ad2f62d78e60cefa8ce0840c82154eb0e70109a49ef80de986' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Verified (data.status = verified | already_verified)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Email verified.' },
                  data: { type: 'object', properties: { status: { type: 'string', enum: ['verified', 'already_verified'] } } }
                }
              }
            }
          }
        },
        400: { description: 'Token expired, replaced by a newer link, or unknown' },
        422: { description: 'Missing / malformed token (e.g. a login JWT was sent)' }
      }
    },
    get: {
      tags: ['2. Authentication'],
      summary: 'Verify Email via Link (opened from the email)',
      description: `Target of the button in the verification email. Verifies the token and returns an **HTML confirmation page**,
or redirects to \`EMAIL_VERIFICATION_REDIRECT_URL?status=verified|already_verified|expired|invalid\` when that setting is configured.
Opening the link twice shows "already verified".`,
      security: [],
      parameters: [
        { name: 'token', in: 'query', required: true, schema: { type: 'string' }, example: 'f850ac54041150ad2f62d78e60cefa8ce0840c82154eb0e70109a49ef80de986' }
      ],
      responses: {
        200: { description: 'HTML page: verified / already verified', content: { 'text/html': { schema: { type: 'string' } } } },
        302: { description: 'Redirect to EMAIL_VERIFICATION_REDIRECT_URL with ?status=' },
        400: { description: 'HTML page: invalid or expired link', content: { 'text/html': { schema: { type: 'string' } } } }
      }
    }
  },

  '/auth/resend-verification': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Resend Verification Email',
      description: 'Sends a fresh verification link to the logged-in user email address (rate limited to 1 request per minute).',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Verification email sent' },
        429: { description: 'Please wait a minute before requesting another verification email' }
      }
    }
  },

  '/auth/forgot-password': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Request Password Reset Link',
      description: 'Generates a secure password reset token and dispatches an email. Always returns 200 OK to prevent account enumeration attacks.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'student@example.com' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Generic success response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'If that email address is registered, a password reset link has been sent.' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/auth/reset-password': {
    post: {
      tags: ['2. Authentication'],
      summary: 'Reset Password with Token',
      description: 'Sets a new account password using a valid reset token. Automatically marks the email as verified upon successful reset.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'new_password'],
              properties: {
                token: { type: 'string', example: '5d8f28ab0912c9...' },
                new_password: { type: 'string', format: 'password', minLength: 8, example: 'NewSecretPass123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password reset successfully' },
        400: { description: 'Reset link is invalid or has expired' }
      }
    }
  },

  '/account/profile': {
    get: {
      tags: ['3. Account Management'],
      summary: 'Get Detailed Account Profile',
      description: 'Returns personal information, address, and tutor bio / social links.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Profile details',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    put: {
      tags: ['3. Account Management'],
      summary: 'Update Personal & Professional Information',
      description: 'Updates names, phone number, bio, location, website, and LinkedIn URL. Accepts multipart form data with optional avatar image.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                first_name: { type: 'string', example: 'John' },
                last_name: { type: 'string', example: 'Doe' },
                phone: { type: 'string', example: '+919876543210' },
                bio: { type: 'string', example: 'Senior Software Architect with 10+ years experience.' },
                date_of_birth: { type: 'string', format: 'date', example: '1992-08-20' },
                gender: { type: 'string', enum: ['male', 'female', 'other'] },
                city: { type: 'string', example: 'Bengaluru' },
                state: { type: 'string', example: 'Karnataka' },
                country: { type: 'string', example: 'India' },
                postal_code: { type: 'string', example: '560001' },
                website: { type: 'string', format: 'uri', example: 'https://johndoe.dev' },
                linkedin_url: { type: 'string', format: 'uri', example: 'https://linkedin.com/in/johndoe' },
                profile_image: { type: 'string', format: 'binary', description: 'Avatar image file (JPG, PNG, WebP)' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Profile updated successfully' },
        409: { description: 'Phone number already used by another account' }
      }
    }
  },

  '/account/profile-photo': {
    put: {
      tags: ['3. Account Management'],
      summary: 'Upload or Replace Profile Photo',
      description: 'Uploads a new profile photo and cleans up any previously stored avatar.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['profile_image'],
              properties: {
                profile_image: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Profile photo updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      profile_image: { type: 'string', example: 'http://localhost:5000/uploads/images/avatar.jpg' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    delete: {
      tags: ['3. Account Management'],
      summary: 'Remove Profile Photo',
      description: 'Deletes the current user avatar from disk and resets the profile image URL to null.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: { description: 'Profile photo removed' }
      }
    }
  },

  '/account/password': {
    put: {
      tags: ['3. Account Management'],
      summary: 'Change Account Password',
      description: 'Requires verification of the existing password before updating to the new password.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['current_password', 'new_password'],
              properties: {
                current_password: { type: 'string', format: 'password', example: 'OldSecretPass1' },
                new_password: { type: 'string', format: 'password', minLength: 8, example: 'NewSecretPass123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password changed successfully' },
        400: { description: 'Current password incorrect or new password identical to current' }
      }
    }
  },

  '/account/settings': {
    get: {
      tags: ['3. Account Management'],
      summary: 'Account Security & Status Overview',
      description: 'Returns account verification statuses, role, registration timestamp, and last login time.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      responses: {
        200: {
          description: 'Security & status summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      email: { type: 'string' },
                      phone: { type: 'string', nullable: true },
                      email_verified: { type: 'boolean' },
                      email_verified_at: { type: 'string', format: 'date-time', nullable: true },
                      phone_verified: { type: 'boolean' },
                      status: { type: 'string' },
                      role: { type: 'string' },
                      last_login_at: { type: 'string', format: 'date-time', nullable: true },
                      member_since: { type: 'string', format: 'date-time' }
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

  '/account/email': {
    put: {
      tags: ['3. Account Management'],
      summary: 'Change Primary Email Address',
      description: 'Requires password verification. Resets email verification status and sends a verification link to the new address.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['new_email', 'current_password'],
              properties: {
                new_email: { type: 'string', format: 'email', example: 'new.email@example.com' },
                current_password: { type: 'string', format: 'password', example: 'MySecurePass1' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Email updated and verification email dispatched' },
        400: { description: 'Incorrect current password or email unchanged' },
        409: { description: 'New email address already taken' }
      }
    }
  },

  '/account/deactivate': {
    post: {
      tags: ['3. Account Management'],
      summary: 'Self-Service Account Deactivation',
      description: 'Deactivates the current account and clears session. Admin accounts cannot self-deactivate.',
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['current_password'],
              properties: {
                current_password: { type: 'string', format: 'password', example: 'MySecurePass1' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Account deactivated and session terminated' },
        400: { description: 'Current password is incorrect' },
        403: { description: 'Admin accounts cannot be self-deactivated' }
      }
    }
  }
};

export default authPaths;
