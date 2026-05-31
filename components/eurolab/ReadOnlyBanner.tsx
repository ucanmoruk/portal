"use client";

import { Eye } from "lucide-react";
import { useCanEdit } from "./EurolabAccessProvider";

/**
 * Eurolab sayfalarının üst kısmında "sadece görüntüleme" uyarı barı.
 * Kullanıcının düzenleme yetkisi yoksa görünür; varsa hiçbir şey render etmez.
 */
export function ReadOnlyBanner({ menuKey }: { menuKey: string }) {
    const canEdit = useCanEdit(menuKey);
    if (canEdit) return null;
    return (
        <div
            role="status"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                marginBottom: 14,
                borderRadius: 10,
                border: "1px solid #fde2b3",
                background: "linear-gradient(0deg, #fff8eb, #fffbf0)",
                color: "#8a5b00",
                fontSize: "0.82rem",
                fontWeight: 600,
            }}
        >
            <Eye size={16} />
            Sadece görüntüleme modunda — bu sayfada düzenleme yapamazsınız. Düzenleme yetkisi için yöneticiniz ile görüşün.
        </div>
    );
}
