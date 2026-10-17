package com.laterior.instagramlocalizer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    static final int PICK_MEDIA = 10, SAVE_FILE = 11;
    WebView web;
    private LinearLayout root;
    private ProgressBar progress;
    private TextView problem;
    private Button retry;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private SaveSession save;
    private boolean destroyed;
    private static class SaveSession {
        String id, name, mime;
        long expected, written;
        int sequence;
        Uri uri;
        OutputStream stream;
        JavaScriptReplyProxy reply;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(22, 18, 32));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else { v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); }
            return insets.consumeSystemWindowInsets();
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, 6));
        problem = new TextView(this); problem.setTextColor(Color.WHITE); problem.setPadding(24, 28, 24, 20); problem.setVisibility(View.GONE); root.addView(problem);
        retry = new Button(this); retry.setText("다시 연결"); retry.setVisibility(View.GONE); retry.setOnClickListener(v -> { if (web == null) recreate(); else web.reload(); }); root.addView(retry);
        setContentView(root);
        createWebView();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::goBack);
        String incoming = getIntent().getDataString();
        web.loadUrl(AppPolicy.isAppUrl(incoming) ? incoming : AppPolicy.ORIGIN + "/");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " InstagramLocalizerAndroid/2.8");
        settings.setSupportZoom(true); settings.setBuiltInZoomControls(true); settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            showProblem("Google Play에서 Android System WebView와 Chrome을 업데이트한 뒤 앱을 다시 열어 주세요. 파일 저장에 필요한 기능이 없어요.");
            retry.setText("업데이트 안내"); retry.setOnClickListener(v -> openExternal(Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.webview")));
            web.setVisibility(View.GONE); return;
        }
        WebViewCompat.addWebMessageListener(web, "LocalizerNative", Collections.singleton(AppPolicy.ORIGIN),
            (view, message, origin, mainFrame, reply) -> {
                if (mainFrame && AppPolicy.isAppUrl(origin.toString()) && AppPolicy.isAppUrl(view.getUrl())) handleMessage(message.getData(), reply);
            });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !AppPolicy.isAppUrl(request.getUrl().toString());
                if (AppPolicy.isAppUrl(request.getUrl().toString())) return false;
                if (request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                cancelSave(); progress.setVisibility(View.VISIBLE); problem.setVisibility(View.GONE); retry.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(View.GONE); CookieManager.getInstance().flush(); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showProblem("연결하지 못했어요. 인터넷 연결을 확인하고 다시 연결해 주세요. 저장된 작업은 지우지 않았어요.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showProblem("서비스에 잠시 연결할 수 없어요. 잠시 후 다시 연결해 주세요.");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                cancelSave(); root.removeView(view); view.destroy(); web = null;
                showProblem("휴대폰 메모리가 부족해 화면이 닫혔어요. 다시 연결하면 마지막으로 자동 저장된 작업을 불러와요."); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int percent) { progress.setProgress(percent); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!AppPolicy.isAppUrl(view.getUrl())) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                ArrayList<String> types = new ArrayList<>();
                for (String type : params.getAcceptTypes()) if (type.startsWith("image/") || type.startsWith("video/")) types.add(type);
                if (types.isEmpty()) { types.add("image/*"); types.add("video/*"); }
                pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(pick, PICK_MEDIA); }
                catch (Exception e) { fileCallback.onReceiveValue(null); fileCallback = null; toast("파일 선택 앱을 열지 못했어요."); }
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (d,w) -> result.confirm()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (d,w) -> result.confirm()).setNegativeButton("취소", (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, type, size) -> toast("화면의 저장 버튼을 다시 눌러 주세요. 문제가 계속되면 앱을 다시 열어 주세요."));
    }

    private void handleMessage(String raw, JavaScriptReplyProxy reply) {
        String id = "";
        try {
            if (raw == null || raw.length() > 1500000) throw new IllegalArgumentException("요청이 너무 커요.");
            JSONObject data = new JSONObject(raw); id = data.getString("id");
            if (!id.matches("[a-zA-Z0-9_-]{1,80}")) return;
            String op = data.getString("op");
            if (op.equals("copy")) {
                String value = data.getString("text");
                if (value.length() > 1000000) throw new IllegalArgumentException("복사할 글이 너무 길어요.");
                ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("게시물", value));
                respond(reply, id, "ok", ""); return;
            }
            if (op.equals("begin")) {
                if (save != null) throw new IllegalArgumentException("다른 파일의 저장을 먼저 마쳐 주세요.");
                SaveSession next = new SaveSession(); next.id = id; next.name = AppPolicy.fileName(data.getString("name")); next.mime = AppPolicy.mime(next.name);
                next.expected = data.getLong("size"); next.reply = reply;
                if (next.expected < 0 || next.expected > AppPolicy.MAX_SAVE_BYTES) throw new IllegalArgumentException("한 번에 256MB까지 저장할 수 있어요. 나라별로 나누어 저장해 주세요.");
                save = next;
                try { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(next.mime).putExtra(Intent.EXTRA_TITLE, next.name), SAVE_FILE); }
                catch (Exception e) { save = null; throw new IllegalArgumentException("저장 위치를 선택할 수 없어요."); }
                return;
            }
            SaveSession current = save;
            if (current == null || !current.id.equals(data.optString("transfer"))) throw new IllegalArgumentException("저장 요청이 만료됐어요. 다시 시도해 주세요.");
            if (op.equals("cancel")) { cancelSave(); respond(reply, id, "cancelled", ""); return; }
            if (current.stream == null) throw new IllegalArgumentException("저장 위치를 먼저 선택해 주세요.");
            if (op.equals("chunk")) {
                String encoded = data.getString("data");
                if (encoded.length() > 65536 || data.getInt("sequence") != current.sequence) throw new IllegalArgumentException("파일 조각 순서가 맞지 않아요.");
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                if (current.written + bytes.length > current.expected) throw new IllegalArgumentException("파일 크기가 맞지 않아요.");
                current.sequence++; current.written += bytes.length;
                String requestId = id;
                writer.execute(() -> {
                    try { current.stream.write(bytes); runOnUiThread(() -> respond(reply, requestId, "ok", "")); }
                    catch (Exception e) { runOnUiThread(() -> { cancelSave(); respond(reply, requestId, "error", "파일을 저장하지 못했어요. 여유 공간과 저장 위치를 확인해 주세요."); }); }
                }); return;
            }
            if (op.equals("finish")) {
                if (current.written != current.expected) throw new IllegalArgumentException("파일이 모두 전달되지 않았어요.");
                String requestId = id;
                writer.execute(() -> {
                    try {
                        current.stream.close(); current.stream = null;
                        runOnUiThread(() -> {
                            if (save != current) return;
                            save = null; respond(reply, requestId, "ok", "");
                            if (!isFinishing() && !destroyed) new AlertDialog.Builder(this).setTitle("파일 저장 완료").setMessage(current.name)
                                .setPositiveButton("공유", (d,w) -> share(current.uri, current.mime)).setNegativeButton("닫기", null).show();
                        });
                    } catch (Exception e) { runOnUiThread(() -> { cancelSave(); respond(reply, requestId, "error", "저장을 마치지 못했어요. 다시 시도해 주세요."); }); }
                }); return;
            }
            throw new IllegalArgumentException("지원하지 않는 요청이에요.");
        } catch (Exception e) { cancelSave(); respond(reply, id, "error", e instanceof IllegalArgumentException ? e.getMessage() : "요청을 처리하지 못했어요."); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_MEDIA && fileCallback != null) {
            ArrayList<Uri> picked = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) for (int i = 0; i < Math.min(20, data.getClipData().getItemCount()); i++) addPicked(picked, data.getClipData().getItemAt(i).getUri());
                else addPicked(picked, data.getData());
            }
            fileCallback.onReceiveValue(picked.isEmpty() ? null : picked.toArray(new Uri[0])); fileCallback = null;
        }
        if (request == SAVE_FILE && save != null) {
            SaveSession current = save;
            if (result != RESULT_OK || data == null || data.getData() == null || !"content".equals(data.getData().getScheme())) {
                save = null; respond(current.reply, current.id, "cancelled", ""); return;
            }
            current.uri = data.getData();
            writer.execute(() -> {
                try {
                    current.stream = getContentResolver().openOutputStream(current.uri, "w");
                    if (current.stream == null) throw new java.io.IOException();
                    runOnUiThread(() -> { if (save == current) respond(current.reply, current.id, "ok", ""); });
                } catch (Exception e) { runOnUiThread(() -> { cancelSave(); respond(current.reply, current.id, "error", "저장 위치에 쓸 수 없어요. 다른 위치를 선택해 주세요."); }); }
            });
        }
    }
    private void addPicked(ArrayList<Uri> list, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme()) && !getPackageName().equals(uri.getAuthority())) list.add(uri);
    }
    private void cancelSave() {
        SaveSession old = save; save = null;
        if (old != null) writer.execute(() -> {
            try { if (old.stream != null) old.stream.close(); } catch (Exception ignored) { }
            try { if (old.uri != null) DocumentsContract.deleteDocument(getContentResolver(), old.uri); } catch (Exception ignored) { }
        });
    }
    private void respond(JavaScriptReplyProxy reply, String id, String status, String error) {
        if (destroyed) return;
        try { JSONObject result = new JSONObject(); result.put("id", id); result.put("status", status); result.put("error", error); reply.postMessage(result.toString()); } catch (Exception ignored) { }
    }
    private void share(Uri uri, String mime) {
        Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).setClipData(ClipData.newRawUri("게시물", uri)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(Intent.createChooser(send, "파일 공유")); } catch (Exception e) { toast("공유할 앱을 찾지 못했어요. 파일 앱에서 저장한 파일을 열어 주세요."); }
    }
    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme()) && !"mailto".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception e) { toast("링크를 열 수 없어요."); }
    }
    private void showProblem(String message) { problem.setText(message); problem.setVisibility(View.VISIBLE); retry.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void goBack() {
        if (web != null && web.canGoBack()) { web.goBack(); return; }
        new AlertDialog.Builder(this).setMessage("앱을 닫을까요? 생성·저장 중이면 완료될 때까지 기다려 주세요.").setPositiveButton("닫기", (d,w) -> finish()).setNegativeButton("계속 작업", null).show();
    }
    @Override public void onBackPressed() { goBack(); }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = intent.getDataString();
        if (web != null && AppPolicy.isAppUrl(url)) { setIntent(intent); web.loadUrl(url); }
    }
    @Override protected void onDestroy() {
        destroyed = true; cancelSave(); writer.shutdown();
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { root.removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}
