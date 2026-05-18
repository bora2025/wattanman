import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BusService } from './bus.service';

@WebSocketGateway({ namespace: '/bus', cors: { origin: '*' } })
export class BusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private busService: BusService) {}

  handleConnection(client: Socket) {
    console.log(`Bus WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Bus WS client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe-to-bus')
  handleSubscribe(@MessageBody() data: { busId: string }, @ConnectedSocket() client: Socket) {
    client.join(`bus:${data.busId}`);
    return { event: 'subscribed', data: { busId: data.busId } };
  }

  @SubscribeMessage('location-update')
  async handleLocationUpdate(
    @MessageBody() data: { busId: string; latitude: number; longitude: number; speed?: number; heading?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const location = await this.busService.recordLocation(data.busId, {
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      heading: data.heading,
    });
    // Broadcast to all clients subscribed to this bus
    this.server.to(`bus:${data.busId}`).emit('bus-location', {
      busId: data.busId,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      heading: data.heading,
      timestamp: location.timestamp,
    });
    return { event: 'location-updated', data: location };
  }
}
