import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Sends email over SMTP (env SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
 * SMTP_PASS, MAIL_FROM). Today that is Gmail with an App Password; moving to
 * Resend or another provider only changes the env values.
 *
 * Without SMTP_HOST, outside production the message is written to the log
 * instead (handy for local work); in production sending fails with a 503.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get configured() {
    return Boolean(this.config.get<string>('SMTP_HOST'));
  }

  private transport(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get<string>('SMTP_PORT', '465')),
      secure: this.config.get<string>('SMTP_SECURE', 'true') !== 'false',
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        // Google shows App Passwords in groups of four; spaces are not part of it.
        pass: this.config.getOrThrow<string>('SMTP_PASS').replace(/\s+/g, ''),
      },
    });
    return this.transporter;
  }

  async send(mail: Mail) {
    if (!this.configured) {
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Email is not configured');
      this.logger.warn(`SMTP not configured; not sending. To: ${mail.to} | ${mail.subject}\n${mail.text}`);
      return;
    }
    try {
      await this.transport().sendMail({
        from: this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('SMTP_USER'),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch (error) {
      this.logger.error(`Sending mail failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('Could not send the email. Try again in a minute.');
    }
  }
}
