import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function paymentReminderApprover() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  // The portal's existing administrator is Oğuzhan (userId 2).
  if (String(session.user.userId) !== "2") return null;
  return String(session.user.userId);
}
