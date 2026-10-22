const shortcutDefaults=Object.freeze({new:'primary+n',save:'primary+s',find:'primary+f',lock:'primary+shift+l',markers:'primary+shift+m',notes:'primary+1',vault:'primary+2',settings:'primary+,'});
const shortcutReserved=new Set(['primary+q','primary+w','primary+h','primary+m','primary+a','primary+c','primary+v','primary+x','primary+z','primary+y','primary+b','primary+i','primary+e','primary+alt+h','primary+shift+z','primary+alt+q']);
function validateShortcuts(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid shortcut configuration');
 const bindings={...shortcutDefaults};
 for(const [action,chord] of Object.entries(input)){
  if(!Object.hasOwn(shortcutDefaults,action)||typeof chord!=='string'||!/^primary\+(shift\+)?(alt\+)?[a-z0-9,]$/.test(chord)||shortcutReserved.has(chord))throw new Error('Invalid or reserved keyboard shortcut');
  bindings[action]=chord;
 }
 if(new Set(Object.values(bindings)).size!==Object.keys(bindings).length)throw new Error('Keyboard shortcuts conflict');
 return {...input};
}
function shortcutChord(event,windows=false){
 if(event.isComposing||event.repeat||event.getModifierState?.('AltGraph')||!(windows?event.ctrlKey&&!event.metaKey:event.metaKey&&!event.ctrlKey))return '';
 let key=event.key?.toLowerCase();
 if(!/^[a-z0-9,]$/.test(key||'')){if(/^Digit[0-9]$/.test(event.code||''))key=event.code.slice(-1);else return '';}
 return 'primary+'+(event.shiftKey?'shift+':'')+(event.altKey?'alt+':'')+key;
}
function shortcutLabel(chord,windows=globalThis.kernpadPlatform==='windows'){
 const parts=chord.split('+'),key=parts.at(-1).toUpperCase();
 return windows?['Ctrl',...(parts.includes('shift')?['Shift']:[]),...(parts.includes('alt')?['Alt']:[]),key].join(' + '):'⌘'+(parts.includes('shift')?'⇧':'')+(parts.includes('alt')?'⌥':'')+key;
}
