package com.xprofilesmanager.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Tema claro de la app: las barras del sistema llevan iconos oscuros. Lo fija NativeThemePlugin desde el tema elegido. */
    static boolean lightBars = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios de la app se registran antes de super.onCreate
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(ProfileBrowserPlugin.class);
        registerPlugin(NativeThemePlugin.class);
        super.onCreate(savedInstanceState);
        useLightSystemBarIcons();

        // Atrás cierra primero el menú o el modal abierto; si no hay ninguno, minimiza la app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript(
                    "(function(){return !!(window.__xpmBack && window.__xpmBack());})()",
                    value -> {
                        if (!"true".equals(value)) moveTaskToBack(true);
                    }
                );
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        useLightSystemBarIcons();
    }

    /** Iconos claros en las barras con el tema oscuro (si no, salen negros sobre negro) y oscuros con el claro. */
    void useLightSystemBarIcons() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(lightBars);
        controller.setAppearanceLightNavigationBars(lightBars);
    }
}
