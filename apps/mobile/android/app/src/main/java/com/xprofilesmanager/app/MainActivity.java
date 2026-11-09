package com.xprofilesmanager.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios de la app se registran antes de super.onCreate
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(ProfileBrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
