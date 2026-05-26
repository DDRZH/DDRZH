const l=(t,e)=>Array.from(new Set([...t,...e].filter(r=>r.trim()))).sort((r,s)=>r.localeCompare(s,"zh-CN")),n=(t,e,r,s)=>s||t.trim()||!e.trim()?!1:r.includes(e);export{l as m,n as s};
