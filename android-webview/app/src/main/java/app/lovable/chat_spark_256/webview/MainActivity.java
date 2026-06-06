package app.lovable.chat_spark_256.webview;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://chat-spark-256.vercel.app/?apk=1.0.9";
    private static final String APP_ORIGIN = "https://chat-spark-256.vercel.app";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int PERMISSION_REQUEST = 1002;

    private FrameLayout rootLayout;
    private WebView webView;
    private View loadingView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private boolean mainFrameError = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        requestNeededPermissions();

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.rgb(2, 4, 12));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setVisibility(View.GONE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        loadingView = createAiChatView();
        loadingView.setOnClickListener(v -> {
            if (mainFrameError) {
                reloadApp();
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        applyLayerForUrl(APP_URL);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent contentIntent = params.createIntent();
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                ArrayList<Intent> extraIntents = new ArrayList<>();
                Intent cameraIntent = createCameraIntent();
                if (cameraIntent != null) {
                    extraIntents.add(cameraIntent);
                }

                Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
                chooserIntent.putExtra(Intent.EXTRA_INTENT, contentIntent);
                chooserIntent.putExtra(Intent.EXTRA_TITLE, "Pilih file atau kamera");
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toArray(new Intent[0]));

                try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
                    showLoadingOnly();
                    applyLayerForUrl(uri.toString());
                    view.loadUrl(uri.toString());
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!"about:blank".equals(url)) {
                    mainFrameError = false;
                    applyLayerForUrl(url);
                    showLoadingOnly();
                }
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameError && !"about:blank".equals(url)) {
                    applyLayerForUrl(url);
                    view.evaluateJavascript(
                            "document.documentElement.classList.add('android-apk-webview');" +
                                    "document.body.classList.add('android-apk-webview-body');" +
                                    "document.documentElement.style.backgroundColor='#080b14';" +
                                    "document.body.style.backgroundColor='#080b14';",
                            null
                    );
                    loadingView.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    mainFrameError = true;
                    showLoadingOnly();
                    try {
                        view.stopLoading();
                        view.loadUrl("about:blank");
                    } catch (Exception ignored) {
                    }
                }
                super.onReceivedError(view, request, error);
            }
        });

        rootLayout.addView(webView);
        rootLayout.addView(loadingView);
        setContentView(rootLayout);

        if (savedInstanceState == null) {
            loadApp();
        } else {
            webView.restoreState(savedInstanceState);
            applyLayerForUrl(webView.getUrl());
            loadingView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
        }
    }

    private void applyLayerForUrl(String url) {
        if (webView == null) return;
        // Always use hardware-accelerated rendering. The software layer used to
        // be applied to /settings pages, but software rendering of tall pages
        // produces gray banding/tearing artifacts on scroll. Hardware scrolling
        // is smooth and the layer-promoting CSS that caused the original
        // ghosting has been removed from the web app.
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    private View createAiChatView() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(42, 42, 42, 42);
        layout.setBackgroundColor(Color.rgb(2, 4, 12));
        layout.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView titleView = new TextView(this);
        titleView.setText("AI Chat");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(30);
        titleView.setGravity(Gravity.CENTER);
        titleView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        titleView.setLetterSpacing(0.03f);

        layout.addView(titleView);
        return layout;
    }

    private void showLoadingOnly() {
        loadingView.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
    }

    private void loadApp() {
        mainFrameError = false;
        showLoadingOnly();
        applyLayerForUrl(APP_URL);
        webView.loadUrl(APP_URL);
    }

    private void reloadApp() {
        mainFrameError = false;
        showLoadingOnly();
        applyLayerForUrl(APP_URL);
        webView.loadUrl(APP_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.getVisibility() == View.VISIBLE) {
            String url = webView.getUrl();
            if (url != null && url.startsWith(APP_ORIGIN)) {
                Uri uri = Uri.parse(url);
                String path = uri.getPath();
                if ("/settings/advanced".equals(path)) {
                    String settingsUrl = APP_ORIGIN + "/settings?apk=1.0.9";
                    applyLayerForUrl(settingsUrl);
                    webView.loadUrl(settingsUrl);
                    return;
                }
                if (path != null && !path.equals("/") && !path.isEmpty()) {
                    applyLayerForUrl(APP_URL);
                    webView.loadUrl(APP_URL);
                    return;
                }
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return;
            }
        }
        super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        super.onDestroy();
    }

    private void requestNeededPermissions() {
        ArrayList<String> permissions = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    private Intent createCameraIntent() {
        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cameraIntent.resolveActivity(getPackageManager()) == null) {
            return null;
        }
        File photoFile;
        try {
            photoFile = createImageFile();
        } catch (IOException e) {
            return null;
        }
        cameraImageUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photoFile);
        cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
        cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return cameraIntent;
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File storageDir = new File(getCacheDir(), "images");
        if (!storageDir.exists()) {
            storageDir.mkdirs();
        }
        return File.createTempFile("IMG_" + timeStamp + "_", ".jpg", storageDir);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) {
            return;
        }
        if (filePathCallback == null) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            if (results == null && cameraImageUri != null) {
                results = new Uri[]{cameraImageUri};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraImageUri = null;
    }
}
