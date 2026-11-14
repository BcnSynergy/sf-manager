import { Global, Module } from '@nestjs/common';
import { EMAIL_SENDER } from '../../application/ports/email-sender.port';
import { getSmtpConfig } from '../env/smtp-config';
import { SmtpEmailSender } from './smtp-email-sender';

// @Global() like FileStorageModule: any module can inject EMAIL_SENDER. The
// SMTP settings are read at boot, so a production stack without them fails
// to start; no connection is opened until the first message is sent.
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: () => SmtpEmailSender.fromConfig(getSmtpConfig(process.env)),
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
