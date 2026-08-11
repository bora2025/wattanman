import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { CircuitBreakerService } from '../security/circuit-breaker.service';

@Injectable()
export class AuthDeliveryService {
  private readonly twilioClient: twilio.Twilio | null;

  constructor(private readonly circuits: CircuitBreakerService) {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (sendgridApiKey) sgMail.setApiKey(sendgridApiKey);

    this.twilioClient =
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        : null;
  }

  async sendEmail(to: string, subject: string, text: string) {
    if (!process.env.SENDGRID_API_KEY) return;
    await this.circuits.execute('email-sendgrid', () => sgMail.send({
      to,
      from: process.env.SENDGRID_FROM || 'noreply@attendancesystem.com',
      subject,
      text,
    }).then(() => undefined));
  }

  async sendSms(to: string, body: string) {
    if (!this.twilioClient || !process.env.TWILIO_PHONE_NUMBER) return;
    await this.circuits.execute('sms-twilio', () => this.twilioClient!.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    }).then(() => undefined));
  }
}
