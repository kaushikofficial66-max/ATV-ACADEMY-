import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';

let io = null;

/**
 * Attaches socket.io to the HTTP server. Clients connect with
 * `io(URL, { auth: { token } })` and are joined to `user:<id>` and `role:<name>`
 * rooms; notifications are pushed as the `notification` event.
 */
export const initSocket = (httpServer, corsOrigin) => {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded || !decoded.id || decoded.purpose) return next(new Error('Unauthorized'));
    socket.data.userId = decoded.id;
    socket.data.role = decoded.role;
    return next();
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role) socket.join(`role:${socket.data.role}`);
  });

  return io;
};

export const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

export const emitToUsers = (userIds, event, payload) => {
  if (!io || !userIds.length) return;
  io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
};

export default { initSocket, emitToUser, emitToUsers };
