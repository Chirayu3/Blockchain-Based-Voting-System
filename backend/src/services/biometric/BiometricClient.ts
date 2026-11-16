import http from "http";
import https from "https";

const DEFAULT_URL = "http://127.0.0.1:8001";
const DEFAULT_SECRET = "b10m3tr1c_s3rv1c3_s3cr3t_2026_d3v";

export interface QualityResult {
  valid: boolean;
  quality?: any;
  error?: string;
}

export interface LivenessResult {
  is_live: boolean;
  pad_score?: number;
  message?: string;
  error?: string;
}

export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  modelIdentifier?: string;
  modelVersion?: string;
  embeddingDimension?: number;
  quality?: any;
  error?: string;
}

export interface MatchResult {
  matched: boolean;
  similarity: number;
  threshold: number;
}

export class BiometricClient {
  private static serviceUrl = process.env.BIOMETRIC_SERVICE_URL || DEFAULT_URL;
  private static serviceSecret =
    process.env.BIOMETRIC_SERVICE_SECRET || DEFAULT_SECRET;

  private static async request<T>(
    endpoint: string,
    body: Record<string, any>
  ): Promise<T> {
    const url = new URL(endpoint, this.serviceUrl);
    const postData = JSON.stringify(body);

    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "X-Internal-Secret": this.serviceSecret,
        },
        timeout: 5000,
      };

      const req = transport.request(options, (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody));
            } catch (err) {
              reject(new Error("Biometric service returned invalid JSON"));
            }
          } else {
            let errorMsg = `Biometric service error (status ${res.statusCode})`;
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.detail) errorMsg = parsed.detail;
            } catch {}
            reject(new Error(errorMsg));
          }
        });
      });

      req.on("error", (err) => {
        reject(
          new Error(
            `Unable to connect to biometric inference service: ${err.message}`
          )
        );
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Biometric inference service request timed out"));
      });

      req.write(postData);
      req.end();
    });
  }

  public static async checkQuality(image: string): Promise<QualityResult> {
    return this.request<QualityResult>("/verify/quality", { image });
  }

  public static async verifyLiveness(
    frames: string[],
    instructions: string[]
  ): Promise<LivenessResult> {
    return this.request<LivenessResult>("/verify/liveness", {
      frames,
      instructions,
    });
  }

  public static async extractEmbedding(
    image: string
  ): Promise<EmbeddingResult> {
    return this.request<EmbeddingResult>("/extract/embedding", { image });
  }

  public static async verifyMatch(
    candidateEmbedding: number[],
    registeredEmbedding: number[]
  ): Promise<MatchResult> {
    return this.request<MatchResult>("/verify/match", {
      candidateEmbedding,
      registeredEmbedding,
    });
  }
}
