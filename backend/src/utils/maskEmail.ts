export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) {
    return email;
  }
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const first = local[0];
  const last = local[local.length - 1];
  return `${first}*****${last}@${domain}`;
}
