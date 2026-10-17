package com.laterior.instagramlocalizer;
import android.app.Activity;
import android.app.Instrumentation.ActivityResult;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebSettings;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.espresso.intent.Intents;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;

@RunWith(AndroidJUnit4.class)
public class AndroidIntegrationTest {
    private ActivityScenario<MainActivity> scenario;
    @Before public void open() { Intents.init(); scenario = ActivityScenario.launch(MainActivity.class); }
    @After public void close() { scenario.close(); Intents.release(); }
    private String js(String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(a -> a.web.evaluateJavascript(source, result -> { value.set(result); done.countDown(); }));
        assertTrue(done.await(15, TimeUnit.SECONDS));
        Object parsed = new JSONTokener(value.get()).nextValue(); return String.valueOf(parsed);
    }
    private void awaitJs(String source, String expected) throws Exception {
        long until = System.currentTimeMillis() + 15000; String last = "";
        do { last = js(source); if (expected.equals(last)) return; Thread.sleep(100); } while (System.currentTimeMillis() < until);
        assertEquals(expected, last);
    }
    private void fixture(String origin) throws Exception {
        scenario.onActivity(a -> { a.web.stopLoading(); a.web.loadDataWithBaseURL(origin + "/", "<html><body><input id='media' type='file' multiple accept='image/*'><script>window.fixtureReady=true</script></body></html>", "text/html", "UTF-8", null); });
        awaitJs("String(window.fixtureReady)", "true");
    }
    @Test public void trustedBridgeAndHardenedSettings() throws Exception {
        fixture(AppPolicy.ORIGIN);
        awaitJs("typeof LocalizerNative", "object");
        scenario.onActivity(a -> {
            assertFalse(a.web.getSettings().getAllowFileAccess());
            assertTrue(a.web.getSettings().getDomStorageEnabled());
            assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, a.web.getSettings().getMixedContentMode());
        });
        js("localStorage.setItem('android-integration-test','restorable'); 'ok'");
        fixture(AppPolicy.ORIGIN);
        assertEquals("restorable", js("localStorage.getItem('android-integration-test')"));
        js("localStorage.removeItem('android-integration-test')");
    }
    @Test public void foreignPageHasNoNativeBridge() throws Exception {
        fixture("https://untrusted.example");
        assertEquals("undefined", js("typeof LocalizerNative"));
    }
    @Test public void copyMessageAndOrderedSaveWriteExactBytes() throws Exception {
        fixture(AppPolicy.ORIGIN);
        Uri destination = Uri.parse("content://com.laterior.instagramlocalizer.test.files/export");
        Intents.intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK, new Intent().setData(destination)));
        js("window.replies={};LocalizerNative.onmessage=e=>{let r=JSON.parse(e.data);replies[r.id]=r.status};LocalizerNative.postMessage(JSON.stringify({id:'copy1',op:'copy',text:'한국어 caption'}));'ok'");
        awaitJs("replies.copy1", "ok");
        js("LocalizerNative.postMessage(JSON.stringify({id:'save1',op:'begin',name:'caption.txt',size:5}));'ok'");
        awaitJs("replies.save1", "ok");
        js("LocalizerNative.postMessage(JSON.stringify({id:'part1',op:'chunk',transfer:'save1',sequence:0,data:'aGVsbG8='}));'ok'");
        awaitJs("replies.part1", "ok");
        js("LocalizerNative.postMessage(JSON.stringify({id:'end1',op:'finish',transfer:'save1'}));'ok'");
        awaitJs("replies.end1", "ok");
        try (var input = InstrumentationRegistry.getInstrumentation().getContext().getContentResolver().openInputStream(destination)) {
            assertEquals("hello", new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        Intents.intended(hasAction(Intent.ACTION_CREATE_DOCUMENT));
    }
    @Test public void cancelledSaveIsReportedWithoutSuccess() throws Exception {
        fixture(AppPolicy.ORIGIN);
        Intents.intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_CANCELED, null));
        js("window.status='';LocalizerNative.onmessage=e=>window.status=JSON.parse(e.data).status;LocalizerNative.postMessage(JSON.stringify({id:'cancelled1',op:'begin',name:'image.png',size:4}));'ok'");
        awaitJs("window.status", "cancelled");
    }
}
