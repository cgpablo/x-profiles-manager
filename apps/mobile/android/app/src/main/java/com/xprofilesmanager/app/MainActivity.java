package com.xprofilesmanager.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios de la app se registran antes de super.onCreate
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(ProfileBrowserPlugin.class);
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

    /** La app es oscura: iconos claros en las barras de estado y de navegación (si no, salen negros sobre negro). */
    private void useLightSystemBarIcons() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }
}
