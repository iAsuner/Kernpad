using System.Security.AccessControl;
using System.Security.Principal;

namespace Kernpad.Core;

public static class SecureFiles {
    public static void Directory(string path) {
        if (System.IO.Directory.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Refusing redirected data directory");
        System.IO.Directory.CreateDirectory(path);
        if (OperatingSystem.IsWindows()) {
            var sid = WindowsIdentity.GetCurrent().User ?? throw new IOException("Missing user identity");
            var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false); acl.SetOwner(sid);
            foreach (var identity in new[] { sid, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
                acl.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(path).SetAccessControl(acl);
        } else File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    }
    public static byte[] Read(string path, int limit = Crypto.MaxBytes * 4) {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Refusing redirected data file");
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (file.Length > limit) throw new IOException("File is too large");
        var bytes = new byte[checked((int)file.Length)]; file.ReadExactly(bytes); return bytes;
    }
    public static void Write(string path, byte[] data) {
        // Export destinations may be shared folders: never change their ACLs.
        var parent = Path.GetDirectoryName(path)!;
        if (!System.IO.Directory.Exists(parent)) Directory(parent);
        else if ((File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) throw new IOException("Refusing redirected destination directory");
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Refusing redirected data file");
        var temporary = Path.Combine(Path.GetDirectoryName(path)!, "." + Guid.NewGuid() + ".tmp");
        try {
            var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None, Options = FileOptions.WriteThrough };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            using (var file = new FileStream(temporary, options)) {
                if (OperatingSystem.IsWindows()) {
                    var acl = new FileSecurity(); acl.SetAccessRuleProtection(true, false);
                    var sid = WindowsIdentity.GetCurrent().User!; acl.SetOwner(sid);
                    acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, AccessControlType.Allow));
                    acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
                    new FileInfo(temporary).SetAccessControl(acl);
                }
                file.Write(data); file.Flush(true);
            }
            File.Move(temporary, path, true);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
