const pendingKeys=new Map<string,string>();
export async function fileBase64(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`/api${path}`,options);
  if(!response.ok){let message='No se pudo conectar con el archivo familiar.';try{message=(await response.json()).message??message;}catch{}throw new Error(message);}
  return response.json();
}
export async function mutate<T>(path:string,body:unknown={},method='POST'):Promise<T>{
  const serialized=JSON.stringify(body);const signature=method+path+serialized;
  let key=pendingKeys.get(signature);if(!key){key=crypto.randomUUID();pendingKeys.set(signature,key);}
  const result=await api<T>(path,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:serialized});
  pendingKeys.delete(signature);return result;
}
