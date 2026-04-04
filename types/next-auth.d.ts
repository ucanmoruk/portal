import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    birimId?: number;
  }
  interface Session {
    user: {
      name?:   string | null;
      email?:  string | null;
      birimId?: number;
      userId?:  string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    birimId?: number;
    userId?:  string;
  }
}
