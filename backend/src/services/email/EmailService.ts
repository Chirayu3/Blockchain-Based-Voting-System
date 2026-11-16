import nodemailer, { Transporter } from "nodemailer";

export interface SendRegistrationEmailParams {
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
   * Dispatches a registration confirmation email containing the voter's permanent Voter ID.
   */
  public static async sendRegistrationEmail(
    params: SendRegistrationEmailParams
  ): Promise<boolean> {
    const from =
      process.env.EMAIL_FROM ||
      "Blockchain-Based Voting System <noreply@bbvs.local>";
    const subject = "Your Voter ID - Blockchain-Based Voting System Registration";

    const text = `Hello ${params.name},

Thank you for registering on the Blockchain-Based Voting System.

Your permanent Voter ID is: ${params.voterId}

IMPORTANT SECURITY NOTICE:
Please record and store your Voter ID safely. You will need your Voter ID along with your password to authenticate and receive login verification codes.

Best regards,
Election Administration Team
Blockchain-Based Voting System`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e3a8a; margin: 0;">Blockchain-Based Voting System</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Secure Cryptographic Voting Portal</p>
        </div>
        <p style="font-size: 16px; color: #1e293b;">Hello <strong>${params.name}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Your registration has been successfully created. Your unique, permanent Voter ID has been generated:
        </p>
        <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <div style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Your Official Voter ID</div>
          <div style="font-size: 24px; font-weight: bold; color: #1e293b; letter-spacing: 0.05em; margin-top: 4px;">${params.voterId}</div>
        </div>
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 14px; border-radius: 6px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.4;">
            <strong>Important Notice:</strong> Keep this Voter ID safe. You must enter this Voter ID to log in and cast cryptographic ballots in active elections.
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
      // Never log sensitive credentials or secrets
      console.error(
        `[EmailService] Failed to deliver registration email to: ${params.to.split("@")[0]}***`
      );
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
}
