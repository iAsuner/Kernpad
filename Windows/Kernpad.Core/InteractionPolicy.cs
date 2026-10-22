using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Kernpad.Core;

// Interactive friction, not offline backup brute-force protection.
public sealed class RecoveryAttempts(Func<double>? clock = null) {
    readonly Func<double> clock = clock ?? (() => (double)Stopwatch.GetTimestamp() / Stopwatch.Frequency);
    int failures;
    double retryAt;
    public int Remaining => (int)Math.Ceiling(Math.Max(0, retryAt - clock()));
    public T Perform<T>(Func<T> operation) {
        if (Remaining > 0) throw new InvalidOperationException($"Too many failed recovery attempts. Try again in {Remaining} seconds.");
        try { var result=operation(); failures=0; retryAt=0; return result; }
        catch { failures=Math.Min(10,failures+1); if(failures>=3)retryAt=clock()+Math.Min(60,Math.Pow(2,failures-2)); throw; }
    }
}

public static class ShortcutConfig {
    public static readonly IReadOnlyDictionary<string,string> Defaults = new Dictionary<string,string>{["new"]="primary+n",["save"]="primary+s",["find"]="primary+f",["lock"]="primary+shift+l",["markers"]="primary+shift+m",["notes"]="primary+1",["vault"]="primary+2",["settings"]="primary+,"};
    static readonly string[] Reserved=["primary+q","primary+w","primary+h","primary+m","primary+a","primary+c","primary+v","primary+x","primary+z","primary+y","primary+b","primary+i","primary+e","primary+alt+h","primary+shift+z","primary+alt+q"];
    public static JsonObject Validate(JsonObject input) {
        var bindings=new Dictionary<string,string>(Defaults);
        foreach(var pair in input){
            if(!Defaults.ContainsKey(pair.Key)||pair.Value is not JsonValue value||!value.TryGetValue<string>(out var chord)||!Regex.IsMatch(chord,@"\Aprimary\+(shift\+)?(alt\+)?[a-z0-9,]\z")||Reserved.Contains(chord))throw new InvalidDataException("Invalid or reserved keyboard shortcut");
            bindings[pair.Key]=chord;
        }
        if(bindings.Values.Distinct().Count()!=bindings.Count)throw new InvalidDataException("Keyboard shortcuts conflict; choose a different combination");
        return input.Copy();
    }
}
