import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthDeliveryService } from '../auth/auth-delivery.service';
import { QueueInfrastructureService } from './queue-infrastructure.service';

type EmailPayload = { to: string; subject: string; text: string };
type SmsPayload = { to: string; body: string };

@Injectable()
export class NotificationWorkerProcessorService implements OnModuleInit {
  constructor(private readonly queues: QueueInfrastructureService, private readonly delivery: AuthDeliveryService) {}

  onModuleInit() {
    this.queues.createWorker('notifications', async (envelope) => {
      if (envelope.type === 'notification.email') {
        const payload = envelope.payload as EmailPayload;
        if (!payload?.to || !payload.subject || !payload.text) throw new Error('Invalid email notification payload');
        await this.delivery.sendEmail(payload.to, payload.subject, payload.text);
        return { delivered: true, channel: 'email' };
      }
      if (envelope.type === 'notification.sms') {
        const payload = envelope.payload as SmsPayload;
        if (!payload?.to || !payload.body) throw new Error('Invalid SMS notification payload');
        await this.delivery.sendSms(payload.to, payload.body);
        return { delivered: true, channel: 'sms' };
      }
      throw new Error(`Unsupported notification job type: ${envelope.type}`);
    });
  }
}
