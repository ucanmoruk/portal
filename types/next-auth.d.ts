import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    birimId?: number;
    laboratuvarBirimId?: number;
    firmalar?: string[];
  }
  interface Session {
    user: {
      name?:   string | null;
      email?:  string | null;
      birimId?: number;
      laboratuvarBirimId?: number;
      firmalar?: string[];
      userId?:  string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    birimId?: number;
    laboratuvarBirimId?: number;
    firmalar?: string[];
    userId?:  string;
  }
}
