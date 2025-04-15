import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// A simplified toy database that mimics Fireproof's database
export class ToyDatabase {
  name: string;
  data: Record<string, any>;
  listeners: Array<() => void>;

  constructor(name: string) {
    this.name = name;
    this.data = {};
    this.listeners = [];
  }

  async put(doc: any): Promise<{ id: string }> {
    const id = doc._id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.data[id] = { ...doc, _id: id };
    this.notifyListeners();
    return { id };
  }

  async get(id: string): Promise<any> {
    return this.data[id] || null;
  }

  async allDocs(): Promise<{ rows: Array<{ id: string, doc: any }> }> {
    const rows = Object.entries(this.data).map(([id, doc]) => ({
      id,
      doc
    }));
    return { rows };
  }

  async delete(id: string): Promise<void> {
    delete this.data[id];
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  async close(): Promise<void> {}
  async destroy(): Promise<void> {
    this.data = {};
  }
}

// Global cache for databases
const databaseCache: Record<string, ToyDatabase> = {};

// Factory function to create/get a database instance
export function toyDatabase(name: string): ToyDatabase {
  if (!databaseCache[name]) {
    databaseCache[name] = new ToyDatabase(name);
  }
  return databaseCache[name];
}

// Pattern 1: Hook that depends on input and conditionally creates or runs other hooks
export function useToyHook(name: string = "default") {
  // Use a ref to track name changes
  const nameRef = useRef(name);
  const didNameChange = nameRef.current !== name;
  
  // Update the ref when name changes
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  
  // Create or get the database instance
  const database = useMemo(() => {
    // Intentionally violating hooks rule with conditional hook execution
    if (didNameChange) {
      // This useState is conditional, which violates the Rules of Hooks
      const [count] = useState(0);
      console.log('Name changed, count:', count);
    }
    
    return toyDatabase(name);
  }, [name, didNameChange]); // Dependency on didNameChange changes hook call order
  
  // Create a live query hook - using memoization patterns similar to Fireproof
  const useToyQuery = useMemo(() => {
    // Creating a hook inside a useMemo - potential hooks rule violation
    return function useToyQueryInner<T>(fieldName: string) {
      // Adding a memoized function inside a hook that may reorder hook calls
      const queryString = useMemo(() => JSON.stringify(fieldName), [fieldName]);
      const fetchData = useCallback(async () => {
        const result = await database.allDocs();
        // Filter by field name
        const filteredRows = result.rows.filter(row => 
          row.doc && row.doc[fieldName] !== undefined
        ).map(row => ({ doc: row.doc as T }));
        return filteredRows;
      }, [database, queryString]);
      
      const [rows, setRows] = useState<Array<{ doc: T }>>([]);
      
      // Effect to fetch data and subscribe to changes
      useEffect(() => {
        let mounted = true;
        
        const loadData = async () => {
          const data = await fetchData();
          if (mounted) {
            setRows(data);
          }
        };
        
        loadData();
        
        const unsubscribe = database.subscribe(() => {
          if (mounted) {
            loadData();
          }
        });
        
        return () => {
          mounted = false;
          unsubscribe();
        };
      }, [database, fetchData]);
      
      return { rows };
    };
  }, [database]);
  
  // Create a document hook - also using patterns that may violate hooks rules
  const useToyDocument = useMemo(() => {
    // This returns a hook inside a useMemo, another potential violation
    return function useToyDocumentInner<T extends Record<string, any>>(initialDocFn: () => T) {
      // We intentionally create a pattern that can violate hook rules
      const initialDoc = useMemo(initialDocFn, [initialDocFn.toString()]);
      const [doc, setDoc] = useState<T & { _id?: string }>(initialDoc);
      
      // Add hooks that depend on dynamic dependencies
      const refreshDoc = useCallback(async () => {
        if (doc._id) {
          const freshDoc = await database.get(doc._id);
          if (freshDoc) setDoc(freshDoc);
        }
      }, [doc._id]);
      
      // Update function with potential changing dependencies
      const updateDoc = useCallback((newData: Partial<T>, options?: { replace?: boolean }) => {
        setDoc(currentDoc => {
          if (options?.replace) {
            return { ...newData as T };
          }
          return { ...currentDoc, ...newData };
        });
      }, []);
      
      // Save function with complex dependencies
      const saveDoc = useCallback(async () => {
        const result = await database.put(doc);
        if (!doc._id) {
          setDoc(currentDoc => ({ ...currentDoc, _id: result.id }));
        }
        return result;
      }, [doc, database]);
      
      // Subscribe to database changes - this creates complex hook dependencies
      useEffect(() => {
        if (!doc._id) return;
        
        const unsubscribe = database.subscribe(async () => {
          refreshDoc();
        });
        
        return unsubscribe;
      }, [doc._id, database, refreshDoc]);
      
      return [doc, updateDoc, saveDoc] as const;
    };
  }, [database]);
  
  return {
    database,
    useToyQuery,
    useToyDocument,
    // Add more methods to test different combinations
    name
  };
}
