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
export class AttendanceGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinClass')
  handleJoinClass(
    @MessageBody() classId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`class-${classId}`);
  }

  @SubscribeMessage('leaveClass')
  handleLeaveClass(
    @MessageBody() classId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`class-${classId}`);
  }

  @SubscribeMessage('joinDashboard')
  handleJoinDashboard(@ConnectedSocket() client: Socket) {
    client.join('dashboard');
  }

  @SubscribeMessage('leaveDashboard')
  handleLeaveDashboard(@ConnectedSocket() client: Socket) {
    client.leave('dashboard');
  }

  notifyAttendanceUpdate(classId: string, attendanceData: any) {
    this.server.to(`class-${classId}`).emit('attendanceUpdate', attendanceData);
    // Also broadcast a lightweight dashboard ping so admin dashboards refresh in real-time
    this.server.to('dashboard').emit('dashboardUpdate', {
      classId,
      studentId: attendanceData?.studentId,
      status: attendanceData?.status,
      timestamp: attendanceData?.timestamp ?? new Date(),
    });
  }
}