import UIKit
import Capacitor

/**
 * I plugin definiti dentro l'app (non come pod) da Capacitor 6 in poi vanno
 * registrati esplicitamente sul bridge: Main.storyboard usa questa classe
 * al posto di CAPBridgeViewController.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WipBackgroundAudioPlugin())
        bridge?.registerPluginInstance(ItaintaBackgroundPoiPlugin())
    }
}
