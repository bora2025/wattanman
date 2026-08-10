import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

@Injectable()
export class AuthDeliveryService {
  private readonly twilioClient: twilio.Twilio | null;

  constructor() {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (sendgridApiKey) sgMail.setApiKey(sendgridApiKey);

    this.twilioClient =
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        : null;
  }

  async sendEmail(to: string, subject: string, text: string) {
    if (!process.env.SENDGRID_API_KEY) return;
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM || 'noreply@attendancesystem.com',
      subject,
      text,
    });
  }

  async sendSms(to: string, body: string) {
    if (!this.twilioClient || !process.env.TWILIO_PHONE_NUMBER) return;
    await this.twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  }
}
