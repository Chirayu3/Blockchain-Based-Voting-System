import nodemailer, { Transporter } from "nodemailer";
import {
  EmailDeliveryLog,
  EmailDeliveryStatus,
  EmailType,
} from "../../entity/EmailDeliveryLog";

export interface SendAcknowledgementParams {
  userId?: number;
  to: string;
  name: string;
}

export interface SendApprovalParams {
  userId?: number;
  to: string;
  name: string;
  voterId: string;
}

export interface SendRejectionParams {
  userId?: number;
  to: string;
  name: string;
  reason?: string;
}

export interface SendRegistrationEmailParams {
  userId?: number;
  to: string;
  name: string;
  voterId: string;
}

export interface SendOtpEmailParams {
  to: string;
  name: string;
  otp: string;
  expiresMinutes?: number;
}

export class EmailService {
  private static transporter: Transporter | null = null;

  public static getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  /**
   * Helper to persist an email delivery log record in MySQL
   */
  private static async createDeliveryLog(params: {
    userId?: number;
    emailType: EmailType;
    recipientEmail: string;
    recipientName: string;
    payload?: Record<string, any>;
  }): Promise<EmailDeliveryLog | null> {
    try {
      const log = new EmailDeliveryLog();
      log.userId = params.userId || null;
      log.emailType = params.emailType;
      log.recipientEmail = params.recipientEmail;
      log.recipientName = params.recipientName;
      log.status = EmailDeliveryStatus.PENDING;
      log.attempts = 0;
      log.payload = params.payload ? JSON.stringify(params.payload) : null;
      return await log.save();
    } catch (err) {
      console.error("[EmailService] Failed to create email delivery log:", err);
      return null;
    }
  }

  /**
   * Helper to update delivery log after dispatch attempt
   */
  private static async updateDeliveryLog(
    log: EmailDeliveryLog | null,
    success: boolean,
    error?: any
  ): Promise<void> {
    if (!log) return;
    try {
      log.attempts += 1;
      if (success) {
        log.status = EmailDeliveryStatus.SENT;
        log.sentAt = new Date();
        log.errorMessage = null;
      } else {
        log.status = EmailDeliveryStatus.FAILED;
        log.errorMessage = error?.message || "Unknown SMTP error";
      }
      await log.save();
    } catch (err) {
      console.error("[EmailService] Failed to update email delivery log:", err);
    }
  }

  /**
   * Dispatches a registration acknowledgement email immediately upon user submission.
   * Informs the user that their request is under review with an expected 24h turnaround.
   * Does NOT include a Voter ID.
   */
  public static async sendRegistrationAcknowledgementEmail(
    params: SendAcknowledgementParams
  ): Promise<boolean> {
    const from =
      process.env.EMAIL_FROM ||
      "Blockchain-Based Voting System <noreply@bbvs.local>";
    const subject = "Voter Registration Request Received - Blockchain Voting System";

    const text = `Dear ${params.name},

Thank you for registering with the Blockchain-Based Voting System.

Your voter registration request has been successfully received and is currently pending administrator verification.

Our administrator will review your submitted information.

You should receive an update within 24 hours. Once your registration is approved, your unique Voter ID will be sent to this registered email address.

Please keep checking your inbox.

Thank you,
Blockchain-Based Voting System Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">Blockchain-Based Voting System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Secure Cryptographic Voting Portal</p>
        </div>
        <p style="font-size: 16px; color: #1e293b;">Dear <strong>${params.name}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Thank you for registering with the Blockchain-Based Voting System.
        </p>
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <div style="font-size: 14px; font-weight: bold; color: #1d4ed8; margin-bottom: 4px;">Registration Under Review</div>
          <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.5;">
            Your voter registration request has been successfully received and is currently pending administrator verification.
          </p>
        </div>
        <p style="font-size: 14px; color: #475569; line-height: 1.5;">
          Our administrator will review your submitted information. You should receive an update within <strong>24 hours</strong>.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.4;">
            Once your registration is approved, your unique permanent Voter ID will be sent to this registered email address. Please keep checking your inbox.
          </p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          Thank you,<br/>
          Blockchain-Based Voting System Team
        </p>
      </div>
    `;

    const log = await this.createDeliveryLog({
      userId: params.userId,
      emailType: EmailType.REGISTRATION_ACKNOWLEDGEMENT,
      recipientEmail: params.to,
      recipientName: params.name,
    });

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
      });
      await this.updateDeliveryLog(log, true);
      return true;
    } catch (error: any) {
      console.error(
        `[EmailService] Failed to deliver acknowledgement email to: ${params.to.split("@")[0]}***`
      );
      await this.updateDeliveryLog(log, false, error);
      return false;
    }
  }

  /**
   * Dispatches the official approval email containing the permanent Voter ID.
   * Only called after administrator approval has successfully committed.
   */
  public static async sendRegistrationApprovalEmail(
    params: SendApprovalParams
  ): Promise<boolean> {
    const from =
      process.env.EMAIL_FROM ||
      "Blockchain-Based Voting System <noreply@bbvs.local>";
    const subject = "Your Voter Registration Has Been Approved - Your Voter ID";

    const text = `Dear ${params.name},

Good news! Your registration request for the Blockchain-Based Voting System has been approved.

Your unique Voter ID is:

${params.voterId}

Please save this Voter ID securely. You will need it along with your password to access the voter portal.

Login procedure:
1. Open the Voter Login Portal.
2. Enter your Voter ID and password.
3. Receive the OTP on your registered email.
4. Verify the OTP to access your account.

Thank you,
Blockchain-Based Voting System Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">Blockchain-Based Voting System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Official Voter Approval Notification</p>
        </div>
        <p style="font-size: 16px; color: #1e293b;">Dear <strong>${params.name}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Good news! Your registration request for the Blockchain-Based Voting System has been approved.
        </p>
        <div style="background-color: #f0fdf4; border: 2px dashed #16a34a; padding: 20px; text-align: center; margin: 24px 0; border-radius: 8px;">
          <div style="font-size: 12px; color: #15803d; text-transform: uppercase; letter-spacing: 0.08em; font-weight: bold; margin-bottom: 6px;">Your Permanent Voter ID</div>
          <div style="font-size: 26px; font-weight: 800; color: #166534; font-family: monospace; letter-spacing: 0.06em;">${params.voterId}</div>
        </div>
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.4;">
            <strong>Security Notice:</strong> Please save this Voter ID securely. You will need it along with your password to access the voter portal.
          </p>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: bold; color: #334155; margin-bottom: 8px;">Login Procedure:</div>
          <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
            <li>Open the Voter Login Portal.</li>
            <li>Enter your Voter ID and password.</li>
            <li>Receive the OTP on your registered email.</li>
            <li>Verify the OTP to access your account.</li>
          </ol>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          Thank you,<br/>
          Blockchain-Based Voting System Team
        </p>
      </div>
    `;

    const log = await this.createDeliveryLog({
      userId: params.userId,
      emailType: EmailType.REGISTRATION_APPROVAL,
      recipientEmail: params.to,
      recipientName: params.name,
      payload: { voterId: params.voterId },
    });

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
      });
      await this.updateDeliveryLog(log, true);
      return true;
    } catch (error: any) {
      console.error(
        `[EmailService] Failed to deliver approval email to: ${params.to.split("@")[0]}***`
      );
      await this.updateDeliveryLog(log, false, error);
      return false;
    }
  }

  /**
   * Dispatches a rejection email when an administrator rejects a registration request.
   */
  public static async sendRegistrationRejectionEmail(
    params: SendRejectionParams
  ): Promise<boolean> {
    const from =
      process.env.EMAIL_FROM ||
      "Blockchain-Based Voting System <noreply@bbvs.local>";
    const subject = "Voter Registration Status Update - Blockchain Voting System";

    const reasonText = params.reason ? `\n\nReason: ${params.reason}` : "";
    const text = `Dear ${params.name},

Thank you for registering with the Blockchain-Based Voting System.

We regret to inform you that after administrative review, your voter registration request could not be approved at this time.${reasonText}

If you believe this decision was made in error or if your citizenship details require reconsideration, please contact system administration.

Thank you,
Blockchain-Based Voting System Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">Blockchain-Based Voting System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Voter Registration Status Update</p>
        </div>
        <p style="font-size: 16px; color: #1e293b;">Dear <strong>${params.name}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Thank you for registering with the Blockchain-Based Voting System.
        </p>
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <div style="font-size: 14px; font-weight: bold; color: #991b1b; margin-bottom: 4px;">Registration Request Rejected</div>
          <p style="margin: 0; font-size: 14px; color: #b91c1c; line-height: 1.5;">
            We regret to inform you that after administrative review, your voter registration request could not be approved at this time.
          </p>
          ${
            params.reason
              ? `<div style="margin-top: 10px; font-size: 13px; color: #7f1d1d; background: #fee2e2; padding: 8px 12px; border-radius: 4px;">
                  <strong>Review Notes:</strong> ${params.reason}
                </div>`
              : ""
          }
        </div>
        <p style="font-size: 14px; color: #475569; line-height: 1.5;">
          If you believe this decision was made in error or if your identification details require reconsideration, please contact election officials.
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          Thank you,<br/>
          Blockchain-Based Voting System Team
        </p>
      </div>
    `;

    const log = await this.createDeliveryLog({
      userId: params.userId,
      emailType: EmailType.REGISTRATION_REJECTION,
      recipientEmail: params.to,
      recipientName: params.name,
      payload: { reason: params.reason },
    });

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
      });
      await this.updateDeliveryLog(log, true);
      return true;
    } catch (error: any) {
      console.error(
        `[EmailService] Failed to deliver rejection email to: ${params.to.split("@")[0]}***`
      );
      await this.updateDeliveryLog(log, false, error);
      return false;
    }
  }

  /**
   * Dispatches a 6-digit OTP code to the voter's registered email.
   */
  public static async sendOtpEmail(
    params: SendOtpEmailParams
  ): Promise<boolean> {
    const expiresMinutes = params.expiresMinutes || 5;
    const from =
      process.env.EMAIL_FROM ||
      "Blockchain-Based Voting System <noreply@bbvs.local>";
    const subject = "Your Verification Code - Blockchain-Based Voting System";

    const text = `Hello ${params.name},

Your one-time verification code (OTP) for voter login is: ${params.otp}

This code is valid for ${expiresMinutes} minutes and can only be used once.

SECURITY WARNING:
Never share this code with anyone. Election officials and system administrators will never ask for your verification code.

Best regards,
Blockchain-Based Voting System`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">Blockchain-Based Voting System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Secure Voter Authentication</p>
        </div>
        <p style="font-size: 16px; color: #1e293b;">Hello <strong>${params.name}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Use the following verification code to complete your voter sign-in:
        </p>
        <div style="background-color: #eff6ff; border: 1px dashed #3b82f6; padding: 20px; text-align: center; margin: 24px 0; border-radius: 8px;">
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">${params.otp}</div>
          <div style="font-size: 13px; color: #60a5fa; margin-top: 8px;">Valid for ${expiresMinutes} minutes</div>
        </div>
        <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 14px; border-radius: 6px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.4;">
            <strong>Security Warning:</strong> Do not share this code with anyone. If you did not attempt to sign in, please secure your account immediately.
          </p>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          This is an automated system email. Please do not reply directly to this message.
        </p>
      </div>
    `;

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
      });
      return true;
    } catch (error: any) {
      console.error(
        `[EmailService] Failed to deliver OTP email to: ${params.to.split("@")[0]}***`
      );
      return false;
    }
  }

  /**
   * Backward compatibility alias for sendRegistrationApprovalEmail
   */
  public static async sendRegistrationEmail(
    params: SendRegistrationEmailParams
  ): Promise<boolean> {
    return this.sendRegistrationApprovalEmail(params);
  }
}
