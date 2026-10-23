package com.laterior.instagramlocalizer;
import android.app.Activity;
import android.app.Instrumentation.ActivityResult;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import android.content.ClipData;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
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
        // Intercept a real HTTPS navigation so getUrl AND the document origin are realistic.
        // loadDataWithBaseURL with a null history URL reports about:blank and is correctly rejected by the app.
        String target = origin + "/android-test-fixture/" + java.util.UUID.randomUUID();
        // A previous document can still report fixtureReady while the next navigation starts.
        // Wait for this unique document instead of accepting the previous page's readiness.
        String html = "<html><body><input id='media' type='file' multiple accept='image/*'><script>window.fixtureReady=true;window.fixtureTarget="
            + org.json.JSONObject.quote(target) + ";</script></body></html>";
        scenario.onActivity(a -> {
            a.web.stopLoading(); WebViewClient original = a.web.getWebViewClient();
            a.web.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (target.equals(request.getUrl().toString())) return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    return original.shouldInterceptRequest(view, request);
                }
                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { original.onPageStarted(view, url, icon); }
                @Override public void onPageFinished(WebView view, String url) { original.onPageFinished(view, url); }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return original.shouldOverrideUrlLoading(view, request); }
            });
            a.web.loadUrl(target);
        });
        awaitJs("window.fixtureTarget", target);
        scenario.onActivity(a -> assertEquals(target, a.web.getUrl()));
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
    @Test public void productionLoginPageLoadsAtPhoneWidth() throws Exception {
        awaitJs("String(document.body && document.body.innerText.includes('인스타그램 게시물 자동생성') && document.body.innerText.includes('로그인'))", "true");
        assertEquals("true", js("String(document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)"));
        assertEquals("true", js("String(!!document.querySelector('input[type=email]') && !!document.querySelector('input[type=password]'))"));
    }
    @Test public void foreignPageHasNoNativeBridge() throws Exception {
        fixture("https://untrusted.example");
        assertEquals("undefined", js("typeof LocalizerNative"));
    }
    @Test public void systemBackAllowsContinuingWithoutLosingTheScreen() throws Exception {
        fixture(AppPolicy.ORIGIN);
        scenario.onActivity(a -> a.web.clearHistory());
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        scenario.onActivity(a -> { assertFalse(a.web.canGoBack()); a.getOnBackPressedDispatcher().onBackPressed(); });
        onView(withText("계속 작업")).inRoot(isDialog()).perform(click());
        scenario.onActivity(a -> assertFalse(a.isFinishing()));
        assertEquals("true", js("String(window.fixtureReady)"));
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
        Intents.intended(org.hamcrest.Matchers.allOf(hasAction(Intent.ACTION_CREATE_DOCUMENT),
            androidx.test.espresso.intent.matcher.IntentMatchers.hasExtra(Intent.EXTRA_LOCAL_ONLY, true),
            androidx.test.espresso.intent.matcher.IntentMatchers.hasExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI,
                android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download"))));
        assertFalse(Intents.getIntents().stream().anyMatch(i -> Intent.ACTION_CHOOSER.equals(i.getAction())));
        onView(withText("파일 저장 완료")).check(androidx.test.espresso.assertion.ViewAssertions.doesNotExist());
    }
    @Test public void mediaPickerReturnsMultipleSelectedContentUris() throws Exception {
        fixture(AppPolicy.ORIGIN);
        Uri first = Uri.parse("content://com.laterior.instagramlocalizer.test.files/first");
        Uri second = Uri.parse("content://com.laterior.instagramlocalizer.test.files/second");
        ClipData selected = ClipData.newRawUri("photos", first); selected.addItem(new ClipData.Item(second));
        Intent selectedResult = new Intent(); selectedResult.setClipData(selected);
        Intents.intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK, selectedResult));
        CompletableFuture<Uri[]> chosen = new CompletableFuture<>();
        scenario.onActivity(a -> a.web.getWebChromeClient().onShowFileChooser(a.web, chosen::complete, new WebChromeClient.FileChooserParams() {
            @Override public int getMode() { return MODE_OPEN_MULTIPLE; }
            @Override public String[] getAcceptTypes() { return new String[]{"image/*,video/*"}; }
            @Override public boolean isCaptureEnabled() { return false; }
            @Override public CharSequence getTitle() { return "Photos"; }
            @Override public String getFilenameHint() { return null; }
            @Override public Intent createIntent() { return new Intent(Intent.ACTION_OPEN_DOCUMENT); }
        }));
        assertArrayEquals(new Uri[]{first, second}, chosen.get(10, TimeUnit.SECONDS));
        Intents.intended(hasAction(Intent.ACTION_OPEN_DOCUMENT));
    }
    @Test public void cancelledSaveIsReportedWithoutSuccess() throws Exception {
        fixture(AppPolicy.ORIGIN);
        Intents.intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_CANCELED, null));
        js("window.status='';LocalizerNative.onmessage=e=>window.status=JSON.parse(e.data).status;LocalizerNative.postMessage(JSON.stringify({id:'cancelled1',op:'begin',name:'images.zip',size:4}));'ok'");
        awaitJs("window.status", "cancelled");
    }

    private Uri galleryItem(String name, Integer expectedPending) {
        AtomicReference<Uri> found = new AtomicReference<>();
        scenario.onActivity(a -> {
            String[] columns = Build.VERSION.SDK_INT >= 29 ? new String[]{"_id", "is_pending", "relative_path"} : new String[]{"_id"};
            android.os.Bundle query = new android.os.Bundle();
            query.putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, "_display_name=?");
            query.putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, new String[]{name});
            // Default gallery queries hide unfinished images, including this app's own rows.
            // Explicitly inspect pending rows so cancellation really verifies their deletion.
            if (Build.VERSION.SDK_INT >= 30) query.putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_INCLUDE);
            Uri collection = Build.VERSION.SDK_INT == 29 ? MediaStore.setIncludePending(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
                : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            try (var cursor = a.getContentResolver().query(collection, columns, query, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    found.set(android.content.ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cursor.getLong(0)));
                    if (Build.VERSION.SDK_INT >= 29 && expectedPending != null) {
                        assertEquals(expectedPending.intValue(), cursor.getInt(1));
                        assertEquals("Pictures/InstagramLocalizer/", cursor.getString(2));
                    }
                }
            }
        });
        return found.get();
    }

    @Test public void gallerySavePublishesExactImageOnlyAfterFinish() throws Exception {
        fixture(AppPolicy.ORIGIN);
        String name = "integration-" + java.util.UUID.randomUUID() + ".png";
        java.io.ByteArrayOutputStream encoded = new java.io.ByteArrayOutputStream();
        android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888).compress(android.graphics.Bitmap.CompressFormat.PNG, 100, encoded);
        byte[] bytes = encoded.toByteArray();
        Uri uri = null;
        try {
            js("window.replies={};LocalizerNative.onmessage=e=>{let r=JSON.parse(e.data);replies[r.id]=r.status};LocalizerNative.postMessage(JSON.stringify({id:'gallery',op:'begin',name:'" + name + "',size:" + bytes.length + "}));'ok'");
            awaitJs("replies.gallery", "ok");
            uri = galleryItem(name, 1); assertNotNull(uri);
            js("LocalizerNative.postMessage(JSON.stringify({id:'galleryChunk',op:'chunk',transfer:'gallery',sequence:0,data:'" + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP) + "'}));'ok'");
            awaitJs("replies.galleryChunk", "ok");
            js("LocalizerNative.postMessage(JSON.stringify({id:'galleryEnd',op:'finish',transfer:'gallery'}));'ok'");
            awaitJs("replies.galleryEnd", "ok");
            assertEquals(uri, galleryItem(name, 0));
            Uri savedUri = uri;
            scenario.onActivity(a -> {
                try (var input = a.getContentResolver().openInputStream(savedUri)) { assertArrayEquals(bytes, input.readAllBytes()); }
                catch (Exception e) { throw new AssertionError(e); }
            });
            onView(withText("사진첩 저장 완료")).check(androidx.test.espresso.assertion.ViewAssertions.doesNotExist());
            assertFalse(Intents.getIntents().stream().anyMatch(i -> Intent.ACTION_CHOOSER.equals(i.getAction())));
        } finally { Uri cleanup = uri; if (cleanup != null) scenario.onActivity(a -> a.getContentResolver().delete(cleanup, null, null)); }
    }

    @Test public void cancelledOrInvalidImageTransferLeavesNoPartialGalleryPhoto() throws Exception {
        fixture(AppPolicy.ORIGIN);
        for (boolean invalid : new boolean[]{false, true}) {
            String name = "incomplete-" + java.util.UUID.randomUUID() + ".png";
            js("window.replies={};LocalizerNative.onmessage=e=>{let r=JSON.parse(e.data);replies[r.id]=r.status};LocalizerNative.postMessage(JSON.stringify({id:'pending',op:'begin',name:'" + name + "',size:5}));'ok'");
            awaitJs("replies.pending", "ok"); assertNotNull(galleryItem(name, 1));
            // A duplicate begin must fail without destroying the active transfer.
            js("LocalizerNative.postMessage(JSON.stringify({id:'duplicate',op:'begin',name:'other.png',size:5}));'ok'");
            awaitJs("replies.duplicate", "error"); assertNotNull(galleryItem(name, 1));
            js(invalid ? "LocalizerNative.postMessage(JSON.stringify({id:'stop',op:'chunk',transfer:'pending',sequence:3,data:'aGVsbG8='}));'ok'"
                : "LocalizerNative.postMessage(JSON.stringify({id:'stop',op:'cancel',transfer:'pending'}));'ok'");
            awaitJs("replies.stop", invalid ? "error" : "cancelled");
            long until = System.currentTimeMillis() + 10000;
            while (galleryItem(name, null) != null && System.currentTimeMillis() < until) Thread.sleep(100);
            assertNull(galleryItem(name, null));
        }
    }

    @Test public void explicitShareUsesPrivateCacheWithoutSaveDialog() throws Exception {
        fixture(AppPolicy.ORIGIN);
        Intents.intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new ActivityResult(Activity.RESULT_CANCELED, null));
        js("window.replies={};LocalizerNative.onmessage=e=>{let r=JSON.parse(e.data);replies[r.id]=r.status};LocalizerNative.postMessage(JSON.stringify({id:'share1',op:'begin',purpose:'share',name:'photos.zip',size:5}));'ok'");
        awaitJs("replies.share1", "ok");
        js("LocalizerNative.postMessage(JSON.stringify({id:'sharePart',op:'chunk',transfer:'share1',sequence:0,data:'aGVsbG8='}));'ok'");
        awaitJs("replies.sharePart", "ok");
        js("LocalizerNative.postMessage(JSON.stringify({id:'shareEnd',op:'finish',transfer:'share1'}));'ok'");
        awaitJs("replies.shareEnd", "ok");
        Intents.intended(hasAction(Intent.ACTION_CHOOSER));
        assertFalse(Intents.getIntents().stream().anyMatch(i -> Intent.ACTION_CREATE_DOCUMENT.equals(i.getAction())));
        Intent chooser = Intents.getIntents().stream().filter(i -> Intent.ACTION_CHOOSER.equals(i.getAction())).findFirst().get();
        Intent send = chooser.getParcelableExtra(Intent.EXTRA_INTENT);
        Uri uri = send.getParcelableExtra(Intent.EXTRA_STREAM);
        assertEquals("com.laterior.instagramlocalizer.exports", uri.getAuthority());
        assertEquals("application/zip", send.getType());
        assertTrue((send.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        scenario.onActivity(a -> {
            try (var input = a.getContentResolver().openInputStream(uri)) { assertEquals("hello", new String(input.readAllBytes(), StandardCharsets.UTF_8)); }
            catch (Exception e) { throw new AssertionError(e); }
            a.getContentResolver().delete(uri, null, null);
        });
    }

    @Test public void repeatedGalleryDownloadsDoNotOpenAnyDialogs() throws Exception {
        // Each call checks exact PNG bytes and removes its own gallery test row.
        gallerySavePublishesExactImageOnlyAfterFinish();
        gallerySavePublishesExactImageOnlyAfterFinish();
        gallerySavePublishesExactImageOnlyAfterFinish();
    }
}
