create index finance_share_reservation_items_owner_fk_idx
  on finance_private.finance_share_upload_reservation_items (
    reservation_id,
    batch_id,
    user_id
  );

create index finance_share_batch_items_owner_fk_idx
  on finance_private.finance_share_batch_items (batch_id, user_id);

create index finance_share_batch_items_intake_owner_fk_idx
  on finance_private.finance_share_batch_items (intake_item_id, user_id)
  where intake_item_id is not null;
