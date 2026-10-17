package com.laterior.instagramlocalizer;

import java.net.URI;
import java.util.Locale;

/** Shared by navigation, messages and tests. No user-provided origin is trusted. */
final class AppPolicy {
    static final String ORIGIN = "https://youtube-finder-dg2x.vercel.app";
    static final long MAX_SAVE_BYTES = 256L * 1024 * 1024;
    static boolean isAppUrl(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                "youtube-finder-dg2x.vercel.app".equalsIgnoreCase(uri.getHost()) &&
                uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    static String fileName(String value) {
        String clean = value.replaceAll("[\\\\/\\p{Cntrl}:*?\"<>|]", "_").trim();
        if (clean.isEmpty() || clean.equals(".") || clean.equals("..")) clean = "instagram-export";
        return clean.length() > 120 ? clean.substring(0, 120) : clean;
    }
    static String mime(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".zip")) return "application/zip";
        if (lower.endsWith(".txt") || lower.endsWith(".srt")) return "text/plain";
        throw new IllegalArgumentException("지원하지 않는 저장 형식이에요.");
    }
}
