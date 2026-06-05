import AdminConfirmDialog from '../../../Admin/AdminConfirmDialog';
import type { VisibilityConfirmState } from '../../vendorProducts.types';

interface VendorProductsVisibilityDialogProps {
    state: VisibilityConfirmState | null;
    onCancel: () => void;
    onConfirm: () => Promise<void> | void;
}

const VendorProductsVisibilityDialog = ({
    state,
    onCancel,
    onConfirm,
}: VendorProductsVisibilityDialogProps) => (
    <AdminConfirmDialog
        open={Boolean(state)}
        title={state?.title || 'Xác nhận thay đổi hiển thị'}
        description={state?.description || ''}
        selectedItems={state?.selectedItems}
        selectedNoun="sản phẩm"
        confirmLabel={state?.confirmLabel || 'Xác nhận'}
        danger={false}
        variant="vendor"
        onCancel={onCancel}
        onConfirm={() => void onConfirm()}
    />
);

export default VendorProductsVisibilityDialog;
