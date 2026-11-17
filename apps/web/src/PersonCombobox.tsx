import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Check,ChevronDown,Search} from 'lucide-react';

type PersonOption={id:string;name:string};
const normalizeName=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');

export function PersonCombobox({people,value,onChange,label}:{people:PersonOption[];value:string;onChange:(id:string)=>void;label:string}){
  const id=useId(),listId=id+'-list',helpId=id+'-help';
  const input=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(-1);
  const indexed=useMemo(()=>people.map(person=>({...person,searchName:normalizeName(person.name)})),[people]);
  const nameCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const person of indexed)counts.set(person.searchName,(counts.get(person.searchName)??0)+1);
    return counts;
  },[indexed]);
  const words=normalizeName(query).trim().split(/\s+/).filter(Boolean);
  const matches=indexed.filter(person=>words.every(word=>person.searchName.includes(word)));
  const selected=people.find(person=>person.id===value);
  const highlighted=matches[active];

  // Keep keyboard navigation inside the visible portion of the suggestions.
  useEffect(()=>{
    if(!open||active<0)return;
    const option=list.current?.children[active] as HTMLElement|undefined;
    if(option&&list.current){
      const top=option.offsetTop,bottom=top+option.offsetHeight;
      if(top<list.current.scrollTop)list.current.scrollTop=top;
      else if(bottom>list.current.scrollTop+list.current.clientHeight)list.current.scrollTop=bottom-list.current.clientHeight;
    }
  },[active,open]);

  function show(){setQuery('');setActive(indexed.findIndex(person=>person.id===value));setOpen(true);}
  function close(){setOpen(false);setQuery('');setActive(-1);}
  function choose(person:PersonOption){onChange(person.id);close();}

  return <div className="person-combobox">
    <label htmlFor={id}>{label}</label>
    <div className="person-combobox-control">
      <Search size={15} aria-hidden="true"/>
      <input ref={input} id={id} role="combobox" autoComplete="off" spellCheck={false}
        aria-autocomplete="list" aria-expanded={open} aria-controls={open?listId:undefined}
        aria-activedescendant={open&&highlighted?`${listId}-${highlighted.id}`:undefined} aria-describedby={helpId}
        value={open?query:selected?.name??''} placeholder="Escribe nombre o apellido…"
        onFocus={show} onClick={()=>{if(!open)show();}} onBlur={close}
        onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}}
        onKeyDown={e=>{
          if(e.nativeEvent.isComposing)return;
          if(e.key==='ArrowDown'||e.key==='ArrowUp'){
            e.preventDefault();
            if(!open){show();return;}
            setActive(current=>matches.length?(e.key==='ArrowDown'?(current+1)%matches.length:(current<=0?matches.length-1:current-1)):-1);
          }else if(e.key==='Enter'&&open){
            e.preventDefault();const person=highlighted??matches[0];if(person)choose(person);
          }else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}
        }}/>
      <ChevronDown size={14} aria-hidden="true"/>
    </div>
    {open&&<div className="person-combobox-popup">
      <p role="status">{matches.length?`${matches.length} ${matches.length===1?'coincidencia':'coincidencias'}`:'No encontramos ese nombre. Prueba con otro nombre o apellido.'}</p>
      <ul ref={list} id={listId} role="listbox" aria-label={label}>
        {matches.map((person,index)=><li id={`${listId}-${person.id}`} key={person.id} role="option" aria-selected={person.id===value}
          className={index===active?'is-active':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(person)}>
          <span>{person.name}{(nameCounts.get(person.searchName)??0)>1&&<small>Ficha {person.id.slice(0,8)}</small>}</span>
          {person.id===value&&<Check size={14} aria-hidden="true"/>}
        </li>)}
      </ul>
    </div>}
    <small id={helpId}>{open&&selected?`Referencia actual: ${selected.name}`:'Escribe para buscar y elige una persona.'}</small>
  </div>;
}
