package com.laterior.instagramlocalizer;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;
/** Installed only in the instrumentation test APK; never in the delivered app. */
public class TestFiles extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File file() { return new File(getContext().getFilesDir(), "test-export.txt"); }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(), ParcelFileDescriptor.parseMode(mode));
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        MatrixCursor cursor = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[]{"test-export.txt", file().length()}); return cursor;
    }
    @Override public String getType(Uri uri) { return "text/plain"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return uri; }
    @Override public int delete(Uri uri, String selection, String[] args) { return file().delete() ? 1 : 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
