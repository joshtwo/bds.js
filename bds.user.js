// ==UserScript==
// @name bds.js
// @namespace deviant-garde.deviantart.com
// @description This script adds support for Botdom Data Share in userscripts. Not recommended to use as a userscript; this is for testing.
// @version 0.1.2
// @include http://chat.deviantart.com/chat/*
// ==/UserScript==


// TODO: Finish the command portion of the commands (/chat and /msg)
contentPageCode = function()
{
    bds = {
        metadata: {
            bdsVersion: "0.3",
            clientVersion: "0.0.2",
            clientName: "dAmnClient/BDS",
        },
        settings: {hideDataShare: true, selfTrigger: false},
        policeBots: [],
        callbacks: {node: [], leaves: {}},
        activate: function()
        {
            dAmnChatbase_dAmnCB_old = dAmnChatbase_dAmnCB;
            dAmnChatbase_dAmnCB = function(e, pkt)
            {
                //try {
                    // TODO:
                    // make it so you can invisibly receive BDS messages in pchats
                    // a debug switch will allow you to see hidden rooms as well as see
                    // otherwise hidden BDS messages in pchats
                    if (e == "data" && (pkt.param == "chat:DataShare" || pkt.param == "chat:DSGateway"))
                    {
                        if (pkt.cmd == "recv")
                        {
                            // don't forget that you'll never see this in a packet solely processed by the default client's code
                            // you're always expected to do this manually to parse subpackets
                            pkt.sub = dAmn_ParsePacket(pkt.body);
                            if (pkt.sub.cmd == "msg" && (bds.selfTrigger || pkt.sub.args.from != dAmn_Client_Username)) bds.parseMsg(pkt);
                            else if (pkt.sub.cmd == "join") bds.parseJoin(pkt.sub);
                        }
                        else if (pkt.cmd == "property" && pkt.args.p == 'members')
                            bds.parseMembers(pkt);
                    }
                    if (!(e == "data" && bds.settings.hideDataShare && (pkt.cmd == "join" | pkt.cmd == "part") && (pkt.param == "chat:DataShare" || pkt.param == "chat:DSGateway")))
                    {
                        dAmnChatbase_dAmnCB_old(e, pkt);
                    }
                //}
                //catch (error) { console.log("Error in dAmn callback: ", error, error.message) }
            };
            // When I simply override the function above, all references to
            // any "dAmnChatbase_dAmnCB" points to it in Firefox.
            // In Chrome, that doesn't happen, and I need to do this additional step.
            // However, that additional step breaks everything in Firefox for some reason
            // so this code needs to only be ran when we know we're in Chrome.
            if (navigator.userAgent.indexOf("Chrome") != -1) dAmn_Callbacks = [dAmnChatbase_dAmnCB];
            
            bds.hookStandardEvents();
        },
        parseMsg: function(pkt)
        {
            var msg, evt = {};
            msg = pkt.sub.body.split(":", 4);
            if (msg.length < 3) return;
            evt.ns = msg[0];
            evt.cat = msg[1];
            evt.cmd = msg[2];
            evt.payload = msg[3];
            evt.from = pkt.sub.args.from;
            // normally "ns" is used to refer to the namespace a message packet is sent in
            // here that meaning is overriden by "BDS command namespace", so instead we use "chat"
            evt.chat = pkt.param; 
            if (evt.payload != null) evt.payload = evt.payload.split(',');
            
            // invoke the relevant events
            this.triggerEvents(evt);
        },
        // currently events are only hooked on BDS messages
        // if you want to hook/trigger general chat events I suggest you use MiddleMan or do it yourself
        // this script isn't meant to solve that issue
        triggerEvents: function(evt)
        {
            var path = [evt.ns, evt.cat, evt.cmd], level = this.callbacks, i = 0;
            do
            {
                if (level.node.length > 0)
                    for (var j = 0; j < level.node.length; ++j)
                        level.node[j](evt);
                // go a deeper level in
                level = path[i] in level.leaves ? level.leaves[path[i]] : null;
            } while (level && ++i);
        },
        hook: function(type, hook)
        {
            // type is an array of [namespace, category, command]
            // hook is the event hook to trigger when an event of the given type occurs
            //
            // TODO: let hooks be identified by a name like in MiddleMan to make them easier to delete?
            //       or force the developer to keep track of what they hook if they want to delete it?
            //
            // event type can be more or less exact by omitting one of the indices from the end
            // i.e. you could have a type of:
            // * [] for an event that runs on EVERY BDS message recieved
            // * ['BDS'] for everything in the BDS namespace
            // * ['BDS', 'BOTCHECK'] for all commands in the BDS:BOTCHECK namespace
            // * ['BDS', 'BOTCHECK', 'ALL'] for hooking against just the BDS:BOTCHECK:ALL command
            this._hook(hook, type, 0, this.callbacks);
        },
        _hook: function(hook, type, depth, level)
        {
            if (depth < type.length)
            {
                if (!(type[depth] in level.leaves))
                    level.leaves[type[depth]] = {node: [], leaves: {}};
                this._hook(hook, type, depth + 1, level.leaves[type[depth]]);
            }
            else level.node.push(hook);
        },
        unhook: function(type, hook) // returns true if deleted successfully, false if not
        {
            // arguments to identify which hook to delete are exactly the same
            // as the ones first used in bds.hook 
            var level = this.callbacks, depth = 0, hookIndex = 0;
            do
            {
                if ((hookIndex = level.node.indexOf(hook)) != -1)
                {
                    level.node.splice(hookIndex, 1);
                    return true;
                }
                else level = type[depth] in level.leaves ? level.leaves[type[depth]] : null;
            } while (level && ++depth);
            return false;
        },
        parseJoin: function(pkt)
        {
            var info = dAmn_ParseArgsNData(pkt.body);
            if (info.args.pc == 'PoliceBot') this.policeBots.push(pkt.param);
        },
        parseMembers: function(pkt)
        {
            do
            {
                pkt = dAmn_ParsePacket(pkt.body);
                if (pkt.args.pc == 'PoliceBot') this.policeBots.push(pkt.param);
            }
            while (pkt.body)
        },
        send: function(ns, cat, cmd, args, chat)
        {
            var bdsMsg;
            if (!(ns || cat || cmd)) return;
            if (!chat) chat = 'chat:DataShare';
            
            bdsMsg = [ns, cat, cmd];
            if (args != null) bdsMsg.push(args.join(','));
            dAmn_Send(chat, 'msg main\n\n' + bdsMsg.join(':'));
        },
        hookStandardEvents: function()
        {
            this.hook(['BDS', 'BOTCHECK'], function(evt) { bds.testBotcheck(evt); });
        },
        testBotcheck: function(evt)
        {
            if (this.policeBots.indexOf(evt.from) == -1) return;
            if (evt.cmd == 'ALL' || (evt.cmd == 'DIRECT' && evt.payload.indexOf(dAmn_Client_Username) != -1))
                this.botcheckRespond(evt.from, evt.chat);
            else if (evt.cmd == 'OK' && evt.payload[0] == dAmn_Client_Username) // if this comes back FAIL, we fucked up and might as well ignore it
            {
                dAmn_Part('chat:DSGateway');
                dAmn_Join('chat:DataShare');
            }
        },
        botcheckRespond: function(user, chat)
        {
            var version = this.metadata.clientVersion + '/' + this.metadata.bdsVersion;
            var hash = md5((this.metadata.clientName + version + dAmn_Client_Username + user).split(' ').join('').toLowerCase());
            this.send('BDS', 'BOTCHECK', 'CLIENT', [user, this.metadata.clientName, version, hash], chat);
        },
    }

    // the notification API is in a separate object from the BDS code
    notify = {
        // this is the element which notices go in
        noticeTray: null,
        // for the notices
        addStyle: function()
        {
            var style = document.createElement('style');
            style.type = 'text/css';
            style.id = 'bds-css';
            style.innerHTML = '#bds-notice-tray {position: absolute;bottom: 5px;right: 5px;z-index: 9001;width: 18em;}.bds-notice {position: relative;border: 1px solid #999999;background-color: #BBC2BB;padding: 5px;margin: 5px;float: left;clear: both;}.bds-notice p {padding: 10px;}.bds-notice h1 {text-align: center;}.bds-notice span.links {text-align: right;font-size: 8pt;}';
            document.head.appendChild(style);
        },
        displayNotice: function(title, p, links, onClose)
        {
            var notice = document.createElement('div');
            var header = document.createElement('h1');
            var imgbox;
            header.innerHTML = title;
            notice.classList.add('bds-notice');
            notice.appendChild(header);
            notice.appendChild(p);
            if (links)
                notice.appendChild(links);
            if (!onClose)
                onClose = function(el) { el.parentNode.removeChild(el) };
            dAmnChat_AddImgBox(notice, 'damncr-close', 'close', 'Close Notice', onClose, notice);

            if (!this.noticeTray)
            {
                this.noticeTray = document.createElement('div');
                this.noticeTray.id = 'bds-notice-tray';
                document.body.appendChild(this.noticeTray);
            }

            this.noticeTray.appendChild(notice);
            
            return notice;
        },
        test: function()
        {
            var p = document.createElement('p');
            var links = document.createElement('span');
            var accept = document.createElement('a'), decline = document.createElement('a');
            var bar = document.createElement('div');
            accept.src = '#';
            accept.innerHTML = 'Accept';
            decline.src = '#';
            decline.innerHTML = 'Decline';

            p.innerHTML = 'Some fucker wants to talk to you. Is that cool with you?';
            bar.innerHTML = ' | ';

            links.classList.add('links');
            links.appendChild(accept);
            links.appendChild(bar);
            links.appendChild(decline);
            this.displayNotice('Private Chat', p, links);
        }
    }
    
    // the pchat and /msg code
    msg = {
        // this is the timer that controls the "user doesn't have a notice-capable client" message
        ackTimer: {},
        pchat: function(user) {
            return 'pchat:' + [dAmn_Client_Username, user].sort().join(':');
        },
        requestChat: function(user)
        {
            bds.sendMsg('CDS', 'LINK', 'REQUEST', [user]);
        },
        // argument is the user who you're waiting for to respond, and
        // the function to run after
        startAckTimer: function(user, callback)
        {
            this.ackTimer[user] = setTimeout(callback, 10000); // supposed to be 10 seconds
        },
        // this handles the CDS:LINK:ACK response
        onAck: function(evt)
        {
            if (evt.payload[0] == dAmn_Client_Username && this.ackTimer[evt.from])
                clearTimeout(this.ackTimer[evt.from]);
        },
        showChatRequest: function(evt)
        {
            if (evt.from != dAmn_Client_Username) return;
            var text = document.createElement('p');
            var user = document.createElement('a');
            var accept = document.createElement('a'), decline = document.createElement('a');
            var links = document.createElement('div');
            var pchat = msg.pchat(evt.from);
            var noticeBox;
            user.href = PHP.userurl(evt.from);
            user.innerHTML = evt.from;
            accept.href = '#';
            accept.onclick = function() {
                // hackish but works
                noticeBox.parentNode.removeChild(noticeBox);
                dAmn_Join(pchat);
                return false;
            }
            accept.innerHTML = 'Accept';

            decline.href = '#';
            decline.onclick = function() {
                noticeBox.parentNode.removeChild(noticeBox);
                bds.send('CDS', 'LINK', 'REJECT', ['user declined to chat']);
                return false;
            }
            decline.innerHTML = 'Decline';
            
            text.appendChild(user);
            text.appendChild(document.createTextNode(' would like to start a private chat with you.'));

            links.appendChild(accept);
            links.appendChild(document.createTextNode(' | '));
            links.appendChild(decline);
            
            noticeBox = notify.displayNotice('Private Chat', text, links, decline.onclick);
            bds.send('CDS', 'LINK', 'ACK', [evt.from]);
        },
        displayRejection: function(evt)
        {
            // this is in case somebody fucked up their own implementation of CDS:LINK
            // if they don't send a CDS:LINK:ACK but reject me then I have to make sure I clear the timer
            if (this.ackTimer[evt.from])
                this.onAck(evt);
            
            var pchat = this.pchat(evt.from);
            if (pchat in dAmnChats) // send the notice in the room
                dAmnChats.makeText('admin', "** The user declined to start a private chat with you.", null, 0);
            else
            {
                var p = document.createElement('p');
                var link = document.createElement('a');
                link.href = PHP.userurl(evt.from);
                link.innerHTML = evt.from;
                p.appendChild(link);
                p.appendChild(document.createTextNode(' declined to start a private chat with you.'));
                notify.displayNotice('Request Rejected', p);
            }
        },
        hookEvents: function()
        {
            bds.hook(['CDS', 'LINK', 'REQUEST'], function(evt) { msg.showChatRequest(evt) });
            bds.hook(['CDS', 'LINK', 'REJECT'], function(evt) { msg.displayRejection(evt) });
            bds.hook(['CDS', 'LINK', 'ACK'], function(evt) { msg.onAck(evt) });
        },
        // add the /msg command
        addCommand: function()
        {
        },
        activate: function()
        {
            this.hookEvents();
            this.addCommand();
        }
    }

    try { 
        bds.activate(); // now everything is set in motion in the content page
        notify.addStyle(); // for the notices
        msg.activate(); // for pchat and /msg
    }
    catch (e) { console.log("Error activating BDS: ", e) }
}

bdsScript = document.createElement("script");
bdsScript.id = 'bds-js';
bdsScript.type = 'text/javascript';
bdsScript.innerHTML = 'try { (' + contentPageCode.toString() + ')(); } catch(e) { console.log("Error loading BDS JS: ", e) } ';
document.getElementsByTagName('head')[0].appendChild(bdsScript);
// and that's where it's all initialized!

// minified code from blueimp's JavaScript MD5 implementation <http://github.com/blueimp/JavaScript-MD5>
// results in the md5() function

md5script = document.createElement("script");
md5script.id = 'bds-js-md5';
md5script.type = 'text/javascript';
md5script.innerHTML = '(function(a){function b(a,b){var c=(a&65535)+(b&65535),d=(a>>16)+(b>>16)+(c>>16);return d<<16|c&65535}function c(a,b){return a<<b|a>>>32-b}function d(a,d,e,f,g,h){return b(c(b(b(d,a),b(f,h)),g),e)}function e(a,b,c,e,f,g,h){return d(b&c|~b&e,a,b,f,g,h)}function f(a,b,c,e,f,g,h){return d(b&e|c&~e,a,b,f,g,h)}function g(a,b,c,e,f,g,h){return d(b^c^e,a,b,f,g,h)}function h(a,b,c,e,f,g,h){return d(c^(b|~e),a,b,f,g,h)}function i(a,c){a[c>>5]|=128<<c%32,a[(c+64>>>9<<4)+14]=c;var d,i,j,k,l,m=1732584193,n=-271733879,o=-1732584194,p=271733878;for(d=0;d<a.length;d+=16)i=m,j=n,k=o,l=p,m=e(m,n,o,p,a[d],7,-680876936),p=e(p,m,n,o,a[d+1],12,-389564586),o=e(o,p,m,n,a[d+2],17,606105819),n=e(n,o,p,m,a[d+3],22,-1044525330),m=e(m,n,o,p,a[d+4],7,-176418897),p=e(p,m,n,o,a[d+5],12,1200080426),o=e(o,p,m,n,a[d+6],17,-1473231341),n=e(n,o,p,m,a[d+7],22,-45705983),m=e(m,n,o,p,a[d+8],7,1770035416),p=e(p,m,n,o,a[d+9],12,-1958414417),o=e(o,p,m,n,a[d+10],17,-42063),n=e(n,o,p,m,a[d+11],22,-1990404162),m=e(m,n,o,p,a[d+12],7,1804603682),p=e(p,m,n,o,a[d+13],12,-40341101),o=e(o,p,m,n,a[d+14],17,-1502002290),n=e(n,o,p,m,a[d+15],22,1236535329),m=f(m,n,o,p,a[d+1],5,-165796510),p=f(p,m,n,o,a[d+6],9,-1069501632),o=f(o,p,m,n,a[d+11],14,643717713),n=f(n,o,p,m,a[d],20,-373897302),m=f(m,n,o,p,a[d+5],5,-701558691),p=f(p,m,n,o,a[d+10],9,38016083),o=f(o,p,m,n,a[d+15],14,-660478335),n=f(n,o,p,m,a[d+4],20,-405537848),m=f(m,n,o,p,a[d+9],5,568446438),p=f(p,m,n,o,a[d+14],9,-1019803690),o=f(o,p,m,n,a[d+3],14,-187363961),n=f(n,o,p,m,a[d+8],20,1163531501),m=f(m,n,o,p,a[d+13],5,-1444681467),p=f(p,m,n,o,a[d+2],9,-51403784),o=f(o,p,m,n,a[d+7],14,1735328473),n=f(n,o,p,m,a[d+12],20,-1926607734),m=g(m,n,o,p,a[d+5],4,-378558),p=g(p,m,n,o,a[d+8],11,-2022574463),o=g(o,p,m,n,a[d+11],16,1839030562),n=g(n,o,p,m,a[d+14],23,-35309556),m=g(m,n,o,p,a[d+1],4,-1530992060),p=g(p,m,n,o,a[d+4],11,1272893353),o=g(o,p,m,n,a[d+7],16,-155497632),n=g(n,o,p,m,a[d+10],23,-1094730640),m=g(m,n,o,p,a[d+13],4,681279174),p=g(p,m,n,o,a[d],11,-358537222),o=g(o,p,m,n,a[d+3],16,-722521979),n=g(n,o,p,m,a[d+6],23,76029189),m=g(m,n,o,p,a[d+9],4,-640364487),p=g(p,m,n,o,a[d+12],11,-421815835),o=g(o,p,m,n,a[d+15],16,530742520),n=g(n,o,p,m,a[d+2],23,-995338651),m=h(m,n,o,p,a[d],6,-198630844),p=h(p,m,n,o,a[d+7],10,1126891415),o=h(o,p,m,n,a[d+14],15,-1416354905),n=h(n,o,p,m,a[d+5],21,-57434055),m=h(m,n,o,p,a[d+12],6,1700485571),p=h(p,m,n,o,a[d+3],10,-1894986606),o=h(o,p,m,n,a[d+10],15,-1051523),n=h(n,o,p,m,a[d+1],21,-2054922799),m=h(m,n,o,p,a[d+8],6,1873313359),p=h(p,m,n,o,a[d+15],10,-30611744),o=h(o,p,m,n,a[d+6],15,-1560198380),n=h(n,o,p,m,a[d+13],21,1309151649),m=h(m,n,o,p,a[d+4],6,-145523070),p=h(p,m,n,o,a[d+11],10,-1120210379),o=h(o,p,m,n,a[d+2],15,718787259),n=h(n,o,p,m,a[d+9],21,-343485551),m=b(m,i),n=b(n,j),o=b(o,k),p=b(p,l);return[m,n,o,p]}function j(a){var b,c="";for(b=0;b<a.length*32;b+=8)c+=String.fromCharCode(a[b>>5]>>>b%32&255);return c}function k(a){var b,c=[];c[(a.length>>2)-1]=undefined;for(b=0;b<c.length;b+=1)c[b]=0;for(b=0;b<a.length*8;b+=8)c[b>>5]|=(a.charCodeAt(b/8)&255)<<b%32;return c}function l(a){return j(i(k(a),a.length*8))}function m(a,b){var c,d=k(a),e=[],f=[],g;e[15]=f[15]=undefined,d.length>16&&(d=i(d,a.length*8));for(c=0;c<16;c+=1)e[c]=d[c]^909522486,f[c]=d[c]^1549556828;return g=i(e.concat(k(b)),512+b.length*8),j(i(f.concat(g),640))}function n(a){var b="0123456789abcdef",c="",d,e;for(e=0;e<a.length;e+=1)d=a.charCodeAt(e),c+=b.charAt(d>>>4&15)+b.charAt(d&15);return c}function o(a){return unescape(encodeURIComponent(a))}function p(a){return l(o(a))}function q(a){return n(p(a))}function r(a,b){return m(o(a),o(b))}function s(a,b){return n(r(a,b))}function t(a,b,c){return b?c?r(b,a):s(b,a):c?p(a):q(a)}"use strict",typeof define=="function"&&define.amd?define(function(){return t}):a.md5=t})(this);';
document.getElementsByTagName('head')[0].appendChild(md5script);
