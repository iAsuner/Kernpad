using System.Windows;

namespace Kernpad.Windows;

public static class Program {
    [STAThread] public static void Main() {
        var app=new Application();
        try { app.Run(new MainWindow()); }
        catch(Exception error) { MessageBox.Show(error.Message,"Kernpad",MessageBoxButton.OK,MessageBoxImage.Error); }
    }
}
