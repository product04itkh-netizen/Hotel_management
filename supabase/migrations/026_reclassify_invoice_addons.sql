-- =================================================================================
-- Fix Historical Add-on Revenue Allocation
-- Splits existing 'House Rental Revenue' journal entry lines into F&B / Activity
-- based on the invoice's line items.
-- =================================================================================

DO $$
DECLARE
  inv RECORD;
  je RECORD;
  jel RECORD;
  item_el jsonb;
  new_items jsonb;
  v_code text;
  v_desc text;
  v_total numeric;
  
  subtotal numeric;
  acc_totals jsonb;
  ratio numeric;
  cred_amt numeric;
  
  v_acc_4000 UUID;
  v_acc_4100 UUID;
  v_acc_4200 UUID;
  v_acc_4400 UUID;
  v_target_acc UUID;
BEGIN
  -- We process invoices that have items
  FOR inv IN SELECT * FROM invoices WHERE status IN ('paid', 'partial') AND jsonb_array_length(items) > 1 LOOP
    
    -- Get account UUIDs for this invoice's branch
    SELECT id INTO v_acc_4000 FROM chart_of_accounts WHERE branch_id = inv.branch_id AND code = '4000';
    SELECT id INTO v_acc_4100 FROM chart_of_accounts WHERE branch_id = inv.branch_id AND code = '4100';
    SELECT id INTO v_acc_4200 FROM chart_of_accounts WHERE branch_id = inv.branch_id AND code = '4200';
    SELECT id INTO v_acc_4400 FROM chart_of_accounts WHERE branch_id = inv.branch_id AND code = '4400';

    new_items := '[]'::jsonb;
    acc_totals := '{"4000": 0, "4100": 0, "4200": 0, "4400": 0}'::jsonb;
    subtotal := 0;

    -- 1. Parse items and determine their categories
    FOR item_el IN SELECT * FROM jsonb_array_elements(inv.items) LOOP
      v_desc := lower(item_el->>'description');
      v_total := (item_el->>'total')::numeric;
      
      -- Guess category
      v_code := '4400';
      IF v_desc ILIKE '%house%' OR v_desc ILIKE '%room%' OR v_desc ILIKE '%bed%' THEN v_code := '4000';
      ELSIF v_desc ILIKE '%food%' OR v_desc ILIKE '%drink%' OR v_desc ILIKE '%breakfast%' OR v_desc ILIKE '%lunch%' OR v_desc ILIKE '%dinner%' OR v_desc ILIKE '%meal%' THEN v_code := '4100';
      ELSIF v_desc ILIKE '%tour%' OR v_desc ILIKE '%activity%' OR v_desc ILIKE '%rental%' OR v_desc ILIKE '%bike%' OR v_desc ILIKE '%transfer%' THEN v_code := '4200';
      END IF;
      
      -- Update item with account code
      item_el := jsonb_set(item_el, '{account_code}', to_jsonb(v_code));
      new_items := new_items || item_el;
      
      -- Accumulate totals
      acc_totals := jsonb_set(acc_totals, ARRAY[v_code], to_jsonb((acc_totals->>v_code)::numeric + v_total));
      subtotal := subtotal + v_total;
    END LOOP;

    -- Update invoice items JSON
    UPDATE invoices SET items = new_items WHERE id = inv.id;

    -- 2. If there's non-4000 revenue, we need to adjust the journal entries
    IF ((acc_totals->>'4100')::numeric > 0 OR (acc_totals->>'4200')::numeric > 0 OR (acc_totals->>'4400')::numeric > 0) AND subtotal > 0 THEN
      
      -- Find Journal Entries related to this invoice (payments or deposit applications)
      FOR je IN SELECT * FROM journal_entries WHERE reference = inv.invoice_number AND is_void = false LOOP
        
        -- Find the specific line that credits 4000 (House Rental Revenue)
        FOR jel IN SELECT * FROM journal_entry_lines WHERE entry_id = je.id AND account_id = v_acc_4000 AND credit > 0 LOOP
          
          -- Calculate the new splits for the total credit amount of this line
          -- We leave the existing 4000 line, update its amount, and insert new lines for 4100/4200/4400
          
          -- Adjust 4000
          ratio := (acc_totals->>'4000')::numeric / subtotal;
          cred_amt := round((jel.credit * ratio), 2);
          UPDATE journal_entry_lines SET credit = cred_amt WHERE id = jel.id;
          
          -- Insert 4100
          ratio := (acc_totals->>'4100')::numeric / subtotal;
          cred_amt := round((jel.credit * ratio), 2);
          IF cred_amt > 0 THEN
            INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
            VALUES (je.id, v_acc_4100, jel.description, 0, cred_amt);
          END IF;

          -- Insert 4200
          ratio := (acc_totals->>'4200')::numeric / subtotal;
          cred_amt := round((jel.credit * ratio), 2);
          IF cred_amt > 0 THEN
            INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
            VALUES (je.id, v_acc_4200, jel.description, 0, cred_amt);
          END IF;
          
          -- Insert 4400
          ratio := (acc_totals->>'4400')::numeric / subtotal;
          cred_amt := round((jel.credit * ratio), 2);
          IF cred_amt > 0 THEN
            INSERT INTO journal_entry_lines (entry_id, account_id, description, debit, credit)
            VALUES (je.id, v_acc_4400, jel.description, 0, cred_amt);
          END IF;
          
        END LOOP;
      END LOOP;
    END IF;

  END LOOP;
END;
$$;
