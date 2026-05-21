import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessagesGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinUser')
  handleJoinUser(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (userId) client.join(`user-${userId}`);
  }

  @SubscribeMessage('leaveUser')
  handleLeaveUser(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (userId) client.leave(`user-${userId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { from: string; to: string; isTyping: boolean },
  ) {
    if (!data?.to) return;
    this.server.to(`user-${data.to}`).emit('typing', {
      from: data.from,
      isTyping: !!data.isTyping,
    });
  }

  notifyNewMessage(receiverId: string, senderId: string, message: any) {
    this.server.to(`user-${receiverId}`).emit('message:new', message);
    this.server.to(`user-${senderId}`).emit('message:sent', message);
  }

  notifyRead(senderId: string, readerId: string) {
    this.server.to(`user-${senderId}`).emit('message:read', { by: readerId });
  }

  notifyAnnouncement(userId: string, announcement: any) {
    this.server.to(`user-${userId}`).emit('announcement:new', announcement);
  }
}
