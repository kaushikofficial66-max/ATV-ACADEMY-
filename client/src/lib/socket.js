'use client';

import { io } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/config';
import { getToken } from '@/lib/auth/token';

let socket = null;

/**
 * Shared socket.io connection (authenticated with the API token). The server
 * pushes `notification` events to the logged-in user.
 */
export const getSocket = () => {
  const token = getToken();
  if (!token) return null;
  if (socket && socket.auth?.token === token) return socket;
  if (socket) socket.disconnect();
  socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
  return socket;
};

export const disconnectSocket = () => {
  if (socket) socket.disconnect();
  socket = null;
};
