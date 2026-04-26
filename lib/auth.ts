import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import sql from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Tesis Girişi",
      credentials: {
        username: { label: "Kullanıcı Adı", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Lütfen kullanıcı adı ve şifrenizi girin.");
        }

        try {
          const pool = await sql;

          // Kolon listesini dinamik oku
          const colsResult = await pool.request().query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'RootKullanici'
          `);
          const cols = colsResult.recordset.map((r: any) => r.COLUMN_NAME as string);

          const passwordCol = cols.find((c) =>
            ["Sifre", "Parola", "Password", "sifre", "password", "parola", "UserPassword", "UserParola"].includes(c)
          );
          const usernameCol = cols.find((c) =>
            ["KullaniciAdi", "Kadi", "UserName", "Username", "kullanici_adi", "Login", "kadi"].includes(c)
          );
          const emailCol = cols.find((c) => ["Email", "email", "EMail", "Eposta"].includes(c));
          const idCol = cols.find((c) => ["Id", "ID", "id", "KullaniciId"].includes(c));
          
          // AdSoyad yoksa Ad ve Soyad'ı birleştir
          const nameCol = cols.find((c) => ["AdSoyad", "FullName", "Name", "Adi"].includes(c));
          const firstNameCol = cols.find((c) => ["Ad", "FirstName", "Firstname"].includes(c));
          const lastNameCol = cols.find((c) => ["Soyad", "LastName", "Lastname"].includes(c));
          
          const birimCol = cols.find((c) => ["BirimID", "BirimId", "birimid", "Birim"].includes(c));

          if (!passwordCol || !usernameCol) {
            throw new Error(`Tablo yapısı okunamadı. Eksik kolonlar var: ${cols.join(", ")}`);
          }

          const whereClause = emailCol
            ? `(LOWER(${usernameCol}) = LOWER(@username) OR LOWER(${emailCol}) = LOWER(@username))`
            : `LOWER(${usernameCol}) = LOWER(@username)`;

          const result = await pool.request()
            .input("username", credentials.username.trim())
            .query(`
              SELECT TOP 1 * FROM RootKullanici
              WHERE ${whereClause}
            `);

          const user = result.recordset[0];

          const storedPassword = user?.[passwordCol] != null ? String(user[passwordCol]) : "";
          const enteredPassword = String(credentials.password);
          const passwordMatches =
            storedPassword === enteredPassword ||
            storedPassword === enteredPassword.trim() ||
            (storedPassword.startsWith("$2") && await bcrypt.compare(enteredPassword, storedPassword));

          if (user && passwordMatches) {
            // İsim oluşturma
            let displayName = user[usernameCol];
            if (nameCol) {
              displayName = user[nameCol];
            } else if (firstNameCol && lastNameCol) {
              displayName = `${user[firstNameCol]} ${user[lastNameCol]}`.trim();
            } else if (firstNameCol) {
              displayName = user[firstNameCol];
            }

            return {
              id: idCol ? String(user[idCol]) : user[usernameCol],
              name: displayName,
              email: emailCol ? user[emailCol] : null,
              birimId: birimCol ? (Number(user[birimCol]) || 0) : 0,
            };
          } else {
            throw new Error("Hatalı kullanıcı adı veya şifre.");
          }
        } catch (error: any) {
          console.error("Auth Hatası:", error);
          throw new Error(error.message || "Giriş işlemi sırasında sunucu hatası oluştu.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.birimId = (user as any).birimId ?? 0;
        token.userId  = user.id; // DB'deki ID (string)
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.birimId = token.birimId ?? 0;
        session.user.userId  = token.userId as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
