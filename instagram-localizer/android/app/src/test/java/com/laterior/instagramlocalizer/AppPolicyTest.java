package com.laterior.instagramlocalizer;
import org.junit.Test;
import static org.junit.Assert.*;
public class AppPolicyTest {
    @Test public void trustedOriginIsExact() {
        assertTrue(AppPolicy.isAppUrl(AppPolicy.ORIGIN + "/?code=abc"));
        assertTrue(AppPolicy.isAppUrl(AppPolicy.ORIGIN + ":443/"));
        for (String bad : new String[]{null, "javascript:alert(1)", "file:" + "///etc/passwd", "http://youtube-finder-dg2x.vercel.app/", "https://youtube-finder-dg2x.vercel.app.evil.test/", "https://user@youtube-finder-dg2x.vercel.app/", "https://youtube-finder-dg2x.vercel.app:444/"}) assertFalse(String.valueOf(bad), AppPolicy.isAppUrl(bad));
    }
    @Test public void filenamesAndTypesAreRestricted() {
        assertEquals(".._.._photo.png", AppPolicy.fileName("../../photo.png"));
        assertEquals("image/png", AppPolicy.mime("한국.PNG"));
        assertEquals("application/zip", AppPolicy.mime("all.zip"));
        assertEquals("text/plain", AppPolicy.mime("captions.srt"));
        assertThrows(IllegalArgumentException.class, () -> AppPolicy.mime("malicious.apk"));
    }
}
